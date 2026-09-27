import { planLegacyMigration } from './legacy-migration-planner.js';
import { createEmptyState, normalizeStateForWrite } from './domain.js';
import { CHAT_METADATA_KEY } from './constants.js';
import {
    getLegacyMigrationUndo,
    putLegacyMigrationUndo,
    removeLegacyMigrationUndo,
} from './legacy-migration-undo-store.js';

let isBusy = false;

/**
 * Determine whether a value is a plain object.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
    if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value)
    ) {
        return false;
    }

    const proto = Object.getPrototypeOf(value);

    return proto === Object.prototype || proto === null;
}

/**
 * Validate an active chat identifier.
 *
 * @param {unknown} chatId
 * @returns {chatId is string}
 */
function isValidChatId(chatId) {
    return (
        typeof chatId === 'string' &&
        chatId.length > 0 &&
        chatId.trim() === chatId
    );
}

/**
 * Deep structural equality comparison.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
    if (a === b) {
        return true;
    }

    if (
        a === null ||
        typeof a !== 'object' ||
        b === null ||
        typeof b !== 'object'
    ) {
        return false;
    }

    if (Array.isArray(a) !== Array.isArray(b)) {
        return false;
    }

    if (Array.isArray(a)) {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i += 1) {
            if (!deepEqual(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) {
        return false;
    }

    for (const key of keysA) {
        if (
            !Object.prototype.hasOwnProperty.call(b, key) ||
            !deepEqual(a[key], b[key])
        ) {
            return false;
        }
    }

    return true;
}

/**
 * Compare two Chromatic Dialogue states for canonical semantic equivalence.
 * Key insertion order does not affect equality.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function areStatesEqual(a, b) {
    if (a === b) {
        return true;
    }

    if (!isPlainObject(a) || !isPlainObject(b)) {
        return false;
    }

    if (a.schemaVersion !== b.schemaVersion) {
        return false;
    }

    const assignmentsA = a.assignments;
    const assignmentsB = b.assignments;

    if (!isPlainObject(assignmentsA) || !isPlainObject(assignmentsB)) {
        return false;
    }

    const keysA = Object.keys(assignmentsA);
    const keysB = Object.keys(assignmentsB);

    if (keysA.length !== keysB.length) {
        return false;
    }

    for (const id of keysA) {
        if (!Object.prototype.hasOwnProperty.call(assignmentsB, id)) {
            return false;
        }
        const itemA = assignmentsA[id];
        const itemB = assignmentsB[id];
        if (!itemA || !itemB) {
            return false;
        }
        if (itemA.name !== itemB.name || itemA.color !== itemB.color) {
            return false;
        }
    }

    return true;
}

/**
 * Deeply clone a state object.
 *
 * @param {object | null} state
 * @returns {object | null}
 */
function cloneState(state) {
    if (state === null || state === undefined) {
        return null;
    }

    const cloned = {
        schemaVersion: state.schemaVersion,
        assignments: {},
    };

    for (const [id, assignment] of Object.entries(state.assignments || {})) {
        cloned.assignments[id] = {
            name: assignment.name,
            color: assignment.color,
        };
    }

    return cloned;
}

/**
 * Deeply clone an arbitrary JSON-compatible data structure.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneDeep(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(cloneDeep);
    }

    const result = {};
    for (const [key, val] of Object.entries(value)) {
        result[key] = cloneDeep(val);
    }

    return result;
}

/**
 * Compare two B3.3 migration plans for deterministic structural equality.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function arePlansEqual(a, b) {
    if (a === b) {
        return true;
    }

    if (!isPlainObject(a) || !isPlainObject(b)) {
        return false;
    }

    if (a.status !== b.status) {
        return false;
    }

    if (!deepEqual(a.sourcePlans, b.sourcePlans)) {
        return false;
    }
    if (!deepEqual(a.newAssignments, b.newAssignments)) {
        return false;
    }
    if (!deepEqual(a.reusedAssignments, b.reusedAssignments)) {
        return false;
    }
    if (!deepEqual(a.messageChanges, b.messageChanges)) {
        return false;
    }
    if (!areStatesEqual(a.plannedState, b.plannedState)) {
        return false;
    }
    if (!deepEqual(a.stats, b.stats)) {
        return false;
    }
    if (!deepEqual(a.errors, b.errors)) {
        return false;
    }

    return true;
}

/**
 * Safely acquire the active SillyTavern context.
 *
 * @returns {object | null}
 */
function acquireContext() {
    try {
        return globalThis.SillyTavern?.getContext?.() ?? null;
    } catch {
        return null;
    }
}

/**
 * Validate that the acquired context is active and matches expectedChatId.
 *
 * @param {object | null} context
 * @param {string} expectedChatId
 * @returns {'no-chat' | 'chat-changed' | 'invalid-context' | 'ready'}
 */
function validateContext(context, expectedChatId) {
    if (!context) {
        return 'no-chat';
    }

    const activeChatId = context.chatId;
    if (
        activeChatId === null ||
        activeChatId === undefined ||
        (typeof activeChatId === 'string' && activeChatId.trim().length === 0)
    ) {
        return 'no-chat';
    }

    if (activeChatId !== expectedChatId) {
        return 'chat-changed';
    }

    if (
        !Array.isArray(context.chat) ||
        !isPlainObject(context.chatMetadata) ||
        typeof context.saveChat !== 'function'
    ) {
        return 'invalid-context';
    }

    return 'ready';
}

/**
 * Apply an approved legacy migration preview transactionally.
 *
 * @param {string} expectedChatId
 * @param {unknown} inventory
 * @param {unknown} mappings
 * @param {unknown} approvedPreview
 * @returns {Promise<object>}
 */
export async function applyLegacyMigration(
    expectedChatId,
    inventory,
    mappings,
    approvedPreview,
) {
    if (isBusy) {
        return { status: 'busy' };
    }

    if (!isValidChatId(expectedChatId)) {
        return { status: 'invalid-request' };
    }

    isBusy = true;
    let mutated = false;
    let saveSucceeded = false;
    let undoStored = false;
    let freshPlan = null;
    let currentStrictState = null;
    let hadPreviousState = false;
    let context = null;

    try {
        context = acquireContext();
        const ctxStatus = validateContext(context, expectedChatId);
        if (ctxStatus !== 'ready') {
            return { status: ctxStatus };
        }

        const chatMetadata = context.chatMetadata;
        hadPreviousState = Object.prototype.hasOwnProperty.call(
            chatMetadata,
            CHAT_METADATA_KEY,
        );

        if (!hadPreviousState) {
            currentStrictState = createEmptyState();
        } else {
            currentStrictState = normalizeStateForWrite(
                chatMetadata[CHAT_METADATA_KEY],
            );
            if (!currentStrictState) {
                return { status: 'invalid-state' };
            }
        }

        if (
            !isPlainObject(approvedPreview) ||
            approvedPreview.status !== 'ready'
        ) {
            return { status: 'invalid-preview' };
        }

        freshPlan = planLegacyMigration(
            context.chat,
            currentStrictState,
            inventory,
            mappings,
        );

        if (!freshPlan || freshPlan.status !== 'ready') {
            return {
                status: 'plan-rejected',
                planStatus: freshPlan?.status,
                errors: Array.isArray(freshPlan?.errors)
                    ? cloneDeep(freshPlan.errors)
                    : [],
            };
        }

        if (!arePlansEqual(freshPlan, approvedPreview)) {
            return { status: 'stale-preview' };
        }

        if (
            Array.isArray(freshPlan.messageChanges) &&
            freshPlan.messageChanges.length === 0 &&
            areStatesEqual(freshPlan.plannedState, currentStrictState)
        ) {
            return { status: 'no-op' };
        }

        // Final context ownership check
        const finalContext = acquireContext();
        const finalCtxStatus = validateContext(finalContext, expectedChatId);
        if (finalCtxStatus !== 'ready') {
            return {
                status: finalCtxStatus === 'no-chat' ? 'no-chat' : 'chat-changed',
            };
        }

        if (
            finalContext.chat !== context.chat ||
            finalContext.chatMetadata !== context.chatMetadata
        ) {
            return { status: 'stale-preview' };
        }

        // Final raw message check
        for (const change of freshPlan.messageChanges) {
            const msg = context.chat[change.messageIndex];
            if (!msg || typeof msg !== 'object' || msg.mes !== change.before) {
                return { status: 'stale-preview' };
            }
        }

        // Final state check
        if (!hadPreviousState) {
            if (
                Object.prototype.hasOwnProperty.call(
                    context.chatMetadata,
                    CHAT_METADATA_KEY,
                )
            ) {
                return { status: 'stale-preview' };
            }
        } else {
            const currentRaw = context.chatMetadata[CHAT_METADATA_KEY];
            const reNormalized = normalizeStateForWrite(currentRaw);
            if (
                !reNormalized ||
                !areStatesEqual(reNormalized, currentStrictState)
            ) {
                return { status: 'stale-preview' };
            }
        }

        const undoSnapshot = {
            chatId: expectedChatId,
            hadPreviousState,
            previousState: hadPreviousState
                ? cloneState(currentStrictState)
                : null,
            appliedState: cloneState(freshPlan.plannedState),
            messages: freshPlan.messageChanges.map((change) => ({
                messageIndex: change.messageIndex,
                before: change.before,
                after: change.after,
            })),
        };

        // In-memory apply
        mutated = true;
        for (const change of freshPlan.messageChanges) {
            context.chat[change.messageIndex].mes = change.after;
        }
        context.chatMetadata[CHAT_METADATA_KEY] = cloneState(
            freshPlan.plannedState,
        );

        // Single persistence boundary
        await context.saveChat();
        saveSucceeded = true;

        const putResult = putLegacyMigrationUndo(undoSnapshot);
        undoStored = putResult?.status === 'stored';

        if (!undoStored) {
            return {
                status: 'applied-undo-unavailable',
                chatId: expectedChatId,
                undoAvailable: false,
                stats: cloneDeep(freshPlan.stats),
            };
        }

        const postContext = acquireContext();
        if (!postContext || postContext.chatId !== expectedChatId) {
            return {
                status: 'applied-chat-changed',
                chatId: expectedChatId,
                undoAvailable: true,
                stats: cloneDeep(freshPlan.stats),
            };
        }

        let concurrentChange = false;
        for (const change of freshPlan.messageChanges) {
            const msg = postContext.chat?.[change.messageIndex];
            if (!msg || typeof msg !== 'object' || msg.mes !== change.after) {
                concurrentChange = true;
                break;
            }
        }

        if (!concurrentChange) {
            const postCD = normalizeStateForWrite(
                postContext.chatMetadata?.[CHAT_METADATA_KEY],
            );
            if (!postCD || !areStatesEqual(postCD, freshPlan.plannedState)) {
                concurrentChange = true;
            }
        }

        if (concurrentChange) {
            return {
                status: 'applied-concurrent-change',
                chatId: expectedChatId,
                undoAvailable: true,
                stats: cloneDeep(freshPlan.stats),
            };
        }

        if (typeof postContext.reloadCurrentChat === 'function') {
            try {
                await postContext.reloadCurrentChat();
            } catch {
                return {
                    status: 'applied-reload-failed',
                    chatId: expectedChatId,
                    undoAvailable: true,
                    stats: cloneDeep(freshPlan.stats),
                };
            }
        }

        return {
            status: 'applied',
            chatId: expectedChatId,
            undoAvailable: true,
            stats: cloneDeep(freshPlan.stats),
        };
    } catch {
        if (saveSucceeded) {
            if (undoStored) {
                return {
                    status: 'applied-concurrent-change',
                    chatId: expectedChatId,
                    undoAvailable: true,
                    stats: cloneDeep(freshPlan?.stats),
                };
            }
            return {
                status: 'applied-undo-unavailable',
                chatId: expectedChatId,
                undoAvailable: false,
                stats: cloneDeep(freshPlan?.stats),
            };
        }

        if (!mutated) {
            return { status: 'operation-error' };
        }

        let rollbackComplete = true;
        if (freshPlan?.messageChanges && context?.chat) {
            for (const change of freshPlan.messageChanges) {
                const msg = context.chat[change.messageIndex];
                if (
                    msg &&
                    typeof msg === 'object' &&
                    msg.mes === change.after
                ) {
                    msg.mes = change.before;
                } else {
                    rollbackComplete = false;
                }
            }
        } else {
            rollbackComplete = false;
        }

        if (context?.chatMetadata) {
            const currentCD = normalizeStateForWrite(
                context.chatMetadata[CHAT_METADATA_KEY],
            );
            if (
                currentCD &&
                freshPlan?.plannedState &&
                areStatesEqual(currentCD, freshPlan.plannedState)
            ) {
                if (hadPreviousState) {
                    context.chatMetadata[CHAT_METADATA_KEY] = cloneState(
                        currentStrictState,
                    );
                } else {
                    delete context.chatMetadata[CHAT_METADATA_KEY];
                }
            } else {
                rollbackComplete = false;
            }
        } else {
            rollbackComplete = false;
        }

        return {
            status: rollbackComplete
                ? 'save-error'
                : 'save-error-rollback-incomplete',
            rollbackComplete,
        };
    } finally {
        isBusy = false;
    }
}

/**
 * Revert the last applied migration using the active session snapshot.
 *
 * @param {string} expectedChatId
 * @returns {Promise<object>}
 */
export async function undoLastLegacyMigration(expectedChatId) {
    if (isBusy) {
        return { status: 'busy' };
    }

    if (!isValidChatId(expectedChatId)) {
        return { status: 'invalid-request' };
    }

    const snapshot = getLegacyMigrationUndo(expectedChatId);
    if (!snapshot) {
        return { status: 'no-undo' };
    }

    isBusy = true;
    let mutated = false;
    let saveSucceeded = false;
    let context = null;

    try {
        context = acquireContext();
        const ctxStatus = validateContext(context, expectedChatId);
        if (ctxStatus !== 'ready') {
            return { status: ctxStatus };
        }

        // Stale undo protection
        for (const m of snapshot.messages) {
            const msg = context.chat[m.messageIndex];
            if (!msg || typeof msg !== 'object' || msg.mes !== m.after) {
                return { status: 'stale-undo' };
            }
        }

        const currentCD = normalizeStateForWrite(
            context.chatMetadata[CHAT_METADATA_KEY],
        );
        if (!currentCD || !areStatesEqual(currentCD, snapshot.appliedState)) {
            return { status: 'stale-undo' };
        }

        // In-memory undo apply
        mutated = true;
        for (const m of snapshot.messages) {
            context.chat[m.messageIndex].mes = m.before;
        }

        if (snapshot.hadPreviousState) {
            context.chatMetadata[CHAT_METADATA_KEY] = cloneState(
                snapshot.previousState,
            );
        } else {
            delete context.chatMetadata[CHAT_METADATA_KEY];
        }

        await context.saveChat();
        saveSucceeded = true;

        // Undo persisted successfully
        removeLegacyMigrationUndo(expectedChatId);

        const postContext = acquireContext();
        if (!postContext || postContext.chatId !== expectedChatId) {
            return {
                status: 'undone-chat-changed',
                chatId: expectedChatId,
            };
        }

        let concurrentChange = false;
        for (const m of snapshot.messages) {
            const msg = postContext.chat?.[m.messageIndex];
            if (!msg || typeof msg !== 'object' || msg.mes !== m.before) {
                concurrentChange = true;
                break;
            }
        }

        if (!concurrentChange) {
            if (snapshot.hadPreviousState) {
                const postCD = normalizeStateForWrite(
                    postContext.chatMetadata?.[CHAT_METADATA_KEY],
                );
                if (
                    !postCD ||
                    !areStatesEqual(postCD, snapshot.previousState)
                ) {
                    concurrentChange = true;
                }
            } else {
                if (
                    Object.prototype.hasOwnProperty.call(
                        postContext.chatMetadata,
                        CHAT_METADATA_KEY,
                    )
                ) {
                    concurrentChange = true;
                }
            }
        }

        if (concurrentChange) {
            return {
                status: 'undone-concurrent-change',
                chatId: expectedChatId,
            };
        }

        if (typeof postContext.reloadCurrentChat === 'function') {
            try {
                await postContext.reloadCurrentChat();
            } catch {
                return {
                    status: 'undone-reload-failed',
                    chatId: expectedChatId,
                };
            }
        }

        return {
            status: 'undone',
            chatId: expectedChatId,
        };
    } catch {
        if (saveSucceeded) {
            removeLegacyMigrationUndo(expectedChatId);
            return {
                status: 'undone-concurrent-change',
                chatId: expectedChatId,
            };
        }

        if (!mutated) {
            return { status: 'operation-error' };
        }

        let rollbackComplete = true;
        if (context?.chat) {
            for (const m of snapshot.messages) {
                const msg = context.chat[m.messageIndex];
                if (msg && typeof msg === 'object' && msg.mes === m.before) {
                    msg.mes = m.after;
                } else {
                    rollbackComplete = false;
                }
            }
        } else {
            rollbackComplete = false;
        }

        if (context?.chatMetadata) {
            const metaMatches = snapshot.hadPreviousState
                ? Object.prototype.hasOwnProperty.call(
                      context.chatMetadata,
                      CHAT_METADATA_KEY,
                  ) &&
                  areStatesEqual(
                      normalizeStateForWrite(
                          context.chatMetadata[CHAT_METADATA_KEY],
                      ),
                      snapshot.previousState,
                  )
                : !Object.prototype.hasOwnProperty.call(
                      context.chatMetadata,
                      CHAT_METADATA_KEY,
                  );

            if (metaMatches) {
                context.chatMetadata[CHAT_METADATA_KEY] = cloneState(
                    snapshot.appliedState,
                );
            } else {
                rollbackComplete = false;
            }
        } else {
            rollbackComplete = false;
        }

        return {
            status: rollbackComplete
                ? 'save-error'
                : 'save-error-rollback-incomplete',
            rollbackComplete,
        };
    } finally {
        isBusy = false;
    }
}