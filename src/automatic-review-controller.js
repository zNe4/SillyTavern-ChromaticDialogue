import {
    putPendingReview as defaultPutPendingReview,
    getPendingReview as defaultGetPendingReview,
} from './pending-review-store.js';
import { approvePendingReview as defaultApprovePendingReview } from './review-approval-service.js';
import { readActiveChatMode as defaultReadActiveChatMode } from './mode-store.js';
import { OPERATION_MODE_AUTOMATIC } from './constants.js';

/**
 * Module-private Promise queue ensuring global sequential approval execution.
 *
 * @type {Promise<void>}
 */
let queueTail = Promise.resolve();

/**
 * Compare a freshly-read pending review against the original queued snapshot.
 *
 * Identity requires exact matches for:
 * - chatId
 * - messageId
 * - proposal count
 * - proposal order
 * - proposal.id
 * - proposal.name
 * - proposal.proposedColor
 *
 * Prepared color and contrastRatio are intentionally excluded from queue identity.
 *
 * @param {object | null | undefined} current
 * @param {object} queued
 * @returns {boolean}
 */
function isMatchingSnapshot(current, queued) {
    if (!current || typeof current !== 'object') {
        return false;
    }

    if (current.chatId !== queued.chatId || current.messageId !== queued.messageId) {
        return false;
    }

    if (!Array.isArray(current.proposals) || !Array.isArray(queued.proposals)) {
        return false;
    }

    if (current.proposals.length !== queued.proposals.length) {
        return false;
    }

    for (let i = 0; i < queued.proposals.length; i += 1) {
        const cur = current.proposals[i];
        const snap = queued.proposals[i];

        if (
            !cur ||
            typeof cur !== 'object' ||
            cur.id !== snap.id ||
            cur.name !== snap.name ||
            cur.proposedColor !== snap.proposedColor
        ) {
            return false;
        }
    }

    return true;
}

/**
 * Execute the serialized approval check and invocation for a queued snapshot.
 *
 * @param {object} queuedSnapshot
 * @param {{
 *     getReview: typeof defaultGetPendingReview,
 *     approveReview: typeof defaultApprovePendingReview,
 *     readMode: typeof defaultReadActiveChatMode,
 * }} dependencies
 * @returns {Promise<object>}
 */
async function executeJob(queuedSnapshot, dependencies) {
    try {
        let modeResult;
        try {
            modeResult = dependencies.readMode();
        } catch {
            return {
                status: 'skipped',
                chatId: queuedSnapshot.chatId,
                messageId: queuedSnapshot.messageId,
                reason: 'chat-changed',
            };
        }

        if (
            !modeResult ||
            modeResult.status !== 'ready' ||
            modeResult.chatId !== queuedSnapshot.chatId
        ) {
            return {
                status: 'skipped',
                chatId: queuedSnapshot.chatId,
                messageId: queuedSnapshot.messageId,
                reason: 'chat-changed',
            };
        }

        if (modeResult.mode !== OPERATION_MODE_AUTOMATIC) {
            return {
                status: 'skipped',
                chatId: queuedSnapshot.chatId,
                messageId: queuedSnapshot.messageId,
                reason: 'mode-changed',
            };
        }

        let currentPending;
        try {
            currentPending = dependencies.getReview(
                queuedSnapshot.chatId,
                queuedSnapshot.messageId,
            );
        } catch {
            return {
                status: 'skipped',
                chatId: queuedSnapshot.chatId,
                messageId: queuedSnapshot.messageId,
                reason: 'pending-missing',
            };
        }

        if (!currentPending) {
            return {
                status: 'skipped',
                chatId: queuedSnapshot.chatId,
                messageId: queuedSnapshot.messageId,
                reason: 'pending-missing',
            };
        }

        if (!isMatchingSnapshot(currentPending, queuedSnapshot)) {
            return {
                status: 'skipped',
                chatId: queuedSnapshot.chatId,
                messageId: queuedSnapshot.messageId,
                reason: 'pending-replaced',
            };
        }

        let approvalResult;
        try {
            approvalResult = await dependencies.approveReview(
                queuedSnapshot.chatId,
                queuedSnapshot.messageId,
            );
        } catch {
            return {
                status: 'left-pending',
                chatId: queuedSnapshot.chatId,
                messageId: queuedSnapshot.messageId,
                reason: 'approval-error',
            };
        }

        if (approvalResult?.status === 'approved') {
            return {
                status: 'approved',
                chatId: queuedSnapshot.chatId,
                messageId: queuedSnapshot.messageId,
            };
        }

        if (approvalResult?.status === 'already-applied') {
            return {
                status: 'already-applied',
                chatId: queuedSnapshot.chatId,
                messageId: queuedSnapshot.messageId,
            };
        }

        return {
            status: 'left-pending',
            chatId: queuedSnapshot.chatId,
            messageId: queuedSnapshot.messageId,
            reason:
                typeof approvalResult?.status === 'string' &&
                approvalResult.status.length > 0
                    ? approvalResult.status
                    : 'unknown',
        };
    } catch {
        return {
            status: 'left-pending',
            chatId: queuedSnapshot.chatId,
            messageId: queuedSnapshot.messageId,
            reason: 'approval-error',
        };
    }
}

/**
 * Enqueue a character review candidate for serialized automatic approval.
 *
 * Candidates are stored immediately in the pending review store. Approval execution
 * is globally serialized and occurs only when the job reaches the front of the queue,
 * confirming active chat mode and unchanged snapshot identity before delegating to
 * approvePendingReview.
 *
 * @param {unknown} review
 * @param {object} [dependencies]
 * @returns {Promise<object>}
 */
export function enqueueAutomaticReview(review, dependencies = {}) {
    try {
        const {
            putPendingReview: putReview = defaultPutPendingReview,
            getPendingReview: getReview = defaultGetPendingReview,
            approvePendingReview: approveReview = defaultApprovePendingReview,
            readActiveChatMode: readMode = defaultReadActiveChatMode,
        } = dependencies ?? {};

        let putResult;
        try {
            putResult = putReview(review);
        } catch {
            return Promise.resolve({ status: 'invalid-review' });
        }

        if (!putResult || putResult.status !== 'stored' || !putResult.review) {
            return Promise.resolve({ status: 'invalid-review' });
        }

        const queuedSnapshot = putResult.review;

        const previousQueue = queueTail;
        const currentJob = (async () => {
            try {
                await previousQueue;
            } catch {
                // Ignore errors from earlier jobs to prevent queue poisoning.
            }

            return executeJob(queuedSnapshot, {
                getReview,
                approveReview,
                readMode,
            });
        })();

        queueTail = currentJob.then(
            () => {},
            () => {},
        );

        return currentJob;
    } catch {
        return Promise.resolve({ status: 'invalid-review' });
    }
}