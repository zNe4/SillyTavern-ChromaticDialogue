import {
    getPendingReview,
    removePendingReview,
} from './pending-review-store.js';
import { readActiveAssistantMessage } from './message-reader.js';
import { parseRegistrationTrailer } from './proposal-parser.js';
import { readActiveChatState } from './chat-store.js';
import { resolveRuntimeOptions } from './runtime-options.js';
import { inspectReceivedMessage } from './message-inspector.js';
import { registerProposalsInActiveChat } from './registration-service.js';

/**
 * Validate that a chatId is an exact non-empty trimmed string.
 *
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
 * Validate that a messageId is a non-negative safe integer number.
 *
 * @param {unknown} messageId
 * @returns {boolean}
 */
function isValidMessageId(messageId) {
    return (
        typeof messageId === 'number' &&
        !Object.is(messageId, -0) &&
        Number.isSafeInteger(messageId) &&
        messageId >= 0
    );
}

/**
 * Create a deep detached copy of a dialogue state object.
 *
 * @param {unknown} state
 * @returns {object | null}
 */
function cloneState(state) {
    if (!state || typeof state !== 'object') {
        return null;
    }

    const cloned = {
        schemaVersion: state.schemaVersion,
        assignments: {},
    };

    if (state.assignments && typeof state.assignments === 'object') {
        for (const [id, assignment] of Object.entries(state.assignments)) {
            if (assignment && typeof assignment === 'object') {
                cloned.assignments[id] = {
                    name: assignment.name,
                    color: assignment.color,
                };
            }
        }
    }

    return cloned;
}

/**
 * Safely remove a pending review only if it still matches the original approval snapshot.
 *
 * @param {string} chatId
 * @param {number} messageId
 * @param {object} pendingSnapshot
 * @param {typeof getPendingReview} getReview
 * @param {typeof removePendingReview} removeReview
 * @returns {boolean}
 */
function safeRemovePendingReview(
    chatId,
    messageId,
    pendingSnapshot,
    getReview,
    removeReview,
) {
    const currentPending = getReview(chatId, messageId);
    if (!currentPending) {
        return false;
    }

    if (
        currentPending.chatId !== pendingSnapshot.chatId ||
        currentPending.messageId !== pendingSnapshot.messageId ||
        !Array.isArray(currentPending.proposals) ||
        currentPending.proposals.length !== pendingSnapshot.proposals.length
    ) {
        return false;
    }

    for (let i = 0; i < pendingSnapshot.proposals.length; i += 1) {
        const cur = currentPending.proposals[i];
        const snap = pendingSnapshot.proposals[i];
        if (
            !cur ||
            cur.id !== snap.id ||
            cur.name !== snap.name ||
            cur.proposedColor !== snap.proposedColor
        ) {
            return false;
        }
    }

    return Boolean(removeReview(chatId, messageId));
}

/**
 * Approve a pending character registration review and persist it into the active chat.
 *
 * @param {unknown} chatId
 * @param {unknown} messageId
 * @param {object} [dependencies]
 * @returns {Promise<object>}
 */
export async function approvePendingReview(
    chatId,
    messageId,
    dependencies = {},
) {
    if (!isValidChatId(chatId) || !isValidMessageId(messageId)) {
        return {
            status: 'invalid-review-key',
        };
    }

    const {
        getPendingReview: getReview = getPendingReview,
        removePendingReview: removeReview = removePendingReview,
        readActiveAssistantMessage: readMessage = readActiveAssistantMessage,
        parseRegistrationTrailer: parseTrailer = parseRegistrationTrailer,
        readActiveChatState: readChatState = readActiveChatState,
        resolveRuntimeOptions: resolveOptions = resolveRuntimeOptions,
        inspectReceivedMessage: inspectMessage = inspectReceivedMessage,
        registerProposalsInActiveChat: registerProposals = registerProposalsInActiveChat,
    } = dependencies;

    // Step 1: Obtain pending review
    const pendingSnapshot = getReview(chatId, messageId);
    if (!pendingSnapshot) {
        return {
            status: 'no-pending',
            chatId,
            messageId,
        };
    }

    // Step 2: Verify current raw source message
    const messageResult = readMessage(messageId);

    if (messageResult.status === 'no-chat') {
        return {
            status: 'chat-changed',
            chatId,
            messageId,
            currentChatId: null,
        };
    }

    if (
        Object.prototype.hasOwnProperty.call(messageResult, 'chatId') &&
        messageResult.chatId !== chatId
    ) {
        return {
            status: 'chat-changed',
            chatId,
            messageId,
            currentChatId: messageResult.chatId,
        };
    }

    if (messageResult.status !== 'ready') {
        return {
            status: 'source-unavailable',
            chatId,
            messageId,
            reason: messageResult.status,
        };
    }

    // Step 3: Parse the CURRENT raw source
    const parseResult = parseTrailer(messageResult.message);
    if (!parseResult.ok) {
        return {
            status: 'stale-pending',
            chatId,
            messageId,
            reason: 'source-parse-rejected',
            errors: Array.isArray(parseResult.errors) ? [...parseResult.errors] : [],
        };
    }

    if (!Array.isArray(parseResult.proposals) || parseResult.proposals.length === 0) {
        return {
            status: 'stale-pending',
            chatId,
            messageId,
            reason: 'source-no-proposals',
            errors: [],
        };
    }

    // Step 4: Exact source fingerprint comparison
    const sourceProposals = parseResult.proposals;
    const pendingProposals = pendingSnapshot.proposals;

    let isFingerprintMatch = sourceProposals.length === pendingProposals.length;
    if (isFingerprintMatch) {
        for (let i = 0; i < sourceProposals.length; i += 1) {
            const src = sourceProposals[i];
            const pend = pendingProposals[i];
            if (
                src.id !== pend.id ||
                src.name !== pend.name ||
                src.color !== pend.proposedColor
            ) {
                isFingerprintMatch = false;
                break;
            }
        }
    }

    if (!isFingerprintMatch) {
        return {
            status: 'stale-pending',
            chatId,
            messageId,
            reason: 'source-changed',
            errors: [],
        };
    }

    // Step 5: Inspect current registry for already-applied reconciliation
    const stateResult = readChatState();

    if (stateResult.status === 'no-chat') {
        return {
            status: 'chat-changed',
            chatId,
            messageId,
            currentChatId: null,
        };
    }

    if (stateResult.chatId !== chatId) {
        return {
            status: 'chat-changed',
            chatId,
            messageId,
            currentChatId: stateResult.chatId,
        };
    }

    if (stateResult.status === 'unsupported-schema') {
        return {
            status: 'unsupported-schema',
            chatId,
            messageId,
        };
    }

    const assignments = stateResult.state?.assignments;
    const hasAssignments = assignments && typeof assignments === 'object';
    const isAlreadyApplied =
        hasAssignments &&
        pendingProposals.length > 0 &&
        pendingProposals.every(p => {
            const stored = assignments[p.id];
            return (
                stored !== null &&
                typeof stored === 'object' &&
                stored.name === p.name
            );
        });

    if (isAlreadyApplied) {
        const pendingRemoved = safeRemovePendingReview(
            chatId,
            messageId,
            pendingSnapshot,
            getReview,
            removeReview,
        );
        return {
            status: 'already-applied',
            chatId,
            messageId,
            pendingRemoved,
        };
    }

    // Step 6: Resolve CURRENT runtime options
    const runtimeResult = resolveOptions();
    if (runtimeResult.status !== 'ready') {
        return {
            status: 'runtime-unavailable',
            chatId,
            messageId,
            reason: runtimeResult.reason,
        };
    }

    // Step 7: Fresh preparation
    const inspection = inspectMessage(messageId, runtimeResult.options);

    if (inspection.status === 'chat-changed') {
        return {
            status: 'chat-changed',
            chatId,
            messageId,
            currentChatId: inspection.currentChatId ?? null,
        };
    }

    if (
        Object.prototype.hasOwnProperty.call(inspection, 'chatId') &&
        inspection.chatId !== chatId
    ) {
        return {
            status: 'chat-changed',
            chatId,
            messageId,
            currentChatId: inspection.chatId,
        };
    }

    if (inspection.status === 'no-proposals') {
        return {
            status: 'stale-pending',
            chatId,
            messageId,
            reason: 'source-no-proposals',
            errors: [],
        };
    }

    if (inspection.status === 'rejected') {
        return {
            status: 'registration-rejected',
            chatId,
            messageId,
            reason: inspection.reason,
            errors: Array.isArray(inspection.errors) ? [...inspection.errors] : [],
        };
    }

    if (inspection.status === 'unsupported-schema') {
        return {
            status: 'unsupported-schema',
            chatId,
            messageId,
        };
    }

    if (inspection.status === 'ignored') {
        return {
            status: 'source-unavailable',
            chatId,
            messageId,
            reason: inspection.reason,
        };
    }

    // Step 8: Compare prepared source again
    const preparedProposals = inspection.proposals;
    let isPreparedMatch =
        Array.isArray(preparedProposals) &&
        preparedProposals.length === pendingProposals.length;

    if (isPreparedMatch) {
        for (let i = 0; i < pendingProposals.length; i += 1) {
            const prep = preparedProposals[i];
            const pend = pendingProposals[i];
            if (
                !prep ||
                prep.id !== pend.id ||
                prep.name !== pend.name ||
                prep.proposedColor !== pend.proposedColor
            ) {
                isPreparedMatch = false;
                break;
            }
        }
    }

    if (!isPreparedMatch) {
        return {
            status: 'stale-pending',
            chatId,
            messageId,
            reason: 'source-changed',
            errors: [],
        };
    }

    // Step 9: Persist using A6
    const proposalsToRegister = preparedProposals.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
    }));

    let registrationResult;
    try {
        registrationResult = await registerProposals(chatId, proposalsToRegister);
    } catch {
        return {
            status: 'persistence-error',
            chatId,
            messageId,
        };
    }

    if (registrationResult.status === 'saved') {
        const pendingRemoved = safeRemovePendingReview(
            chatId,
            messageId,
            pendingSnapshot,
            getReview,
            removeReview,
        );
        return {
            status: 'approved',
            chatId,
            messageId,
            added: Array.isArray(registrationResult.added)
                ? registrationResult.added.map(p => ({
                      id: p.id,
                      name: p.name,
                      color: p.color,
                  }))
                : [],
            state: cloneState(registrationResult.state),
            pendingRemoved,
        };
    }

    if (registrationResult.status === 'rejected') {
        return {
            status: 'registration-rejected',
            chatId,
            messageId,
            reason: 'registry-rejected',
            errors: Array.isArray(registrationResult.errors)
                ? [...registrationResult.errors]
                : [],
        };
    }

    if (registrationResult.status === 'unsupported-schema') {
        return {
            status: 'unsupported-schema',
            chatId,
            messageId,
        };
    }

    if (registrationResult.status === 'no-chat') {
        return {
            status: 'chat-changed',
            chatId,
            messageId,
            currentChatId: null,
        };
    }

    if (registrationResult.status === 'chat-changed') {
        return {
            status: 'chat-changed',
            chatId,
            messageId,
            currentChatId: registrationResult.chatId ?? null,
        };
    }

    if (registrationResult.status === 'invalid-state') {
        return {
            status: 'registration-failed',
            chatId,
            messageId,
            reason: 'invalid-state',
        };
    }

    if (registrationResult.status === 'no-op') {
        return {
            status: 'registration-failed',
            chatId,
            messageId,
            reason: 'unexpected-no-op',
        };
    }

    return {
        status: 'registration-failed',
        chatId,
        messageId,
        reason: registrationResult?.status || 'unknown',
    };
}