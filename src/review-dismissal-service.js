import {
    getPendingReview,
    removePendingReview,
} from './pending-review-store.js';

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} chatId
 * @returns {boolean}
 */
function isValidChatId(chatId) {
    return (
        typeof chatId === 'string' &&
        chatId.length > 0 &&
        chatId.trim() === chatId
    );
}

/**
 * @param {unknown} messageId
 * @returns {boolean}
 */
function isValidMessageId(messageId) {
    return (
        typeof messageId === 'number' &&
        Number.isSafeInteger(messageId) &&
        messageId >= 0 &&
        !Object.is(messageId, -0)
    );
}

/**
 * @param {unknown} proposal
 * @returns {boolean}
 */
function isValidProposalSnapshot(proposal) {
    if (!isObject(proposal)) {
        return false;
    }

    const { id, name, proposedColor } = proposal;

    return (
        typeof id === 'string' &&
        id.length > 0 &&
        typeof name === 'string' &&
        name.length > 0 &&
        typeof proposedColor === 'string' &&
        proposedColor.length > 0
    );
}

/**
 * @param {unknown} snapshot
 * @returns {boolean}
 */
function isValidSnapshot(snapshot) {
    try {
        if (!isObject(snapshot)) {
            return false;
        }

        if (!isValidChatId(snapshot.chatId)) {
            return false;
        }

        if (!isValidMessageId(snapshot.messageId)) {
            return false;
        }

        if (!Array.isArray(snapshot.proposals) || snapshot.proposals.length === 0) {
            return false;
        }

        for (const proposal of snapshot.proposals) {
            if (!isValidProposalSnapshot(proposal)) {
                return false;
            }
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Dismisses a pending review if the current stored proposal source matches the snapshot.
 *
 * @param {unknown} reviewSnapshot
 * @param {object} [_deps]
 * @returns {{ status: string, chatId?: string, messageId?: number }}
 */
export function dismissPendingReview(reviewSnapshot, _deps = {}) {
    if (!isValidSnapshot(reviewSnapshot)) {
        return {
            status: 'invalid-review',
        };
    }

    const getReview = _deps.getPendingReview ?? getPendingReview;
    const removeReview = _deps.removePendingReview ?? removePendingReview;

    const { chatId, messageId, proposals: snapshotProposals } = reviewSnapshot;

    const current = getReview(chatId, messageId);
    if (!current) {
        return {
            status: 'no-pending',
            chatId,
            messageId,
        };
    }

    const currentProposals = current.proposals;
    if (!Array.isArray(currentProposals) || currentProposals.length !== snapshotProposals.length) {
        return {
            status: 'stale-review',
            chatId,
            messageId,
        };
    }

    for (let i = 0; i < snapshotProposals.length; i++) {
        const snap = snapshotProposals[i];
        const cur = currentProposals[i];

        if (
            !cur ||
            cur.id !== snap.id ||
            cur.name !== snap.name ||
            cur.proposedColor !== snap.proposedColor
        ) {
            return {
                status: 'stale-review',
                chatId,
                messageId,
            };
        }
    }

    const removed = removeReview(chatId, messageId);
    if (!removed) {
        return {
            status: 'no-pending',
            chatId,
            messageId,
        };
    }

    return {
        status: 'dismissed',
        chatId,
        messageId,
    };
}