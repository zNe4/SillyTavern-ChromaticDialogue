import { normalizeStateForWrite } from './domain.js';

/** @type {Map<string, object>} */
const undoStore = new Map();

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
 * Deeply clone a Chromatic Dialogue state.
 *
 * @param {object | null} state
 * @returns {object | null}
 */
function cloneState(state) {
    if (state === null) {
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
 * Deeply clone an undo snapshot.
 *
 * @param {object} snapshot
 * @returns {object}
 */
function cloneSnapshot(snapshot) {
    return {
        chatId: snapshot.chatId,
        hadPreviousState: snapshot.hadPreviousState,
        previousState: cloneState(snapshot.previousState),
        appliedState: cloneState(snapshot.appliedState),
        messages: snapshot.messages.map((m) => ({
            messageIndex: m.messageIndex,
            before: m.before,
            after: m.after,
        })),
    };
}

/**
 * Validate an undo snapshot candidate structure.
 *
 * @param {unknown} snapshot
 * @returns {boolean}
 */
function isValidSnapshot(snapshot) {
    if (!isPlainObject(snapshot)) {
        return false;
    }

    const keys = Object.keys(snapshot);
    if (keys.length !== 5) {
        return false;
    }
    if (
        !keys.includes('chatId') ||
        !keys.includes('hadPreviousState') ||
        !keys.includes('previousState') ||
        !keys.includes('appliedState') ||
        !keys.includes('messages')
    ) {
        return false;
    }

    if (!isValidChatId(snapshot.chatId)) {
        return false;
    }

    if (typeof snapshot.hadPreviousState !== 'boolean') {
        return false;
    }

    if (snapshot.hadPreviousState === false) {
        if (snapshot.previousState !== null) {
            return false;
        }
    } else {
        if (normalizeStateForWrite(snapshot.previousState) === null) {
            return false;
        }
    }

    if (normalizeStateForWrite(snapshot.appliedState) === null) {
        return false;
    }

    if (!Array.isArray(snapshot.messages) || snapshot.messages.length === 0) {
        return false;
    }

    let lastIndex = -1;
    for (let i = 0; i < snapshot.messages.length; i += 1) {
        const msg = snapshot.messages[i];
        if (!isPlainObject(msg)) {
            return false;
        }

        const msgKeys = Object.keys(msg);
        if (msgKeys.length !== 3) {
            return false;
        }
        if (
            !msgKeys.includes('messageIndex') ||
            !msgKeys.includes('before') ||
            !msgKeys.includes('after')
        ) {
            return false;
        }

        if (
            typeof msg.messageIndex !== 'number' ||
            !Number.isSafeInteger(msg.messageIndex) ||
            msg.messageIndex < 0
        ) {
            return false;
        }

        if (i === 0) {
            lastIndex = msg.messageIndex;
        } else {
            if (msg.messageIndex <= lastIndex) {
                return false;
            }
            lastIndex = msg.messageIndex;
        }

        if (
            typeof msg.before !== 'string' ||
            typeof msg.after !== 'string' ||
            msg.before === msg.after
        ) {
            return false;
        }
    }

    return true;
}

/**
 * Stores a migration undo snapshot for the given chat.
 *
 * @param {unknown} snapshot
 * @returns {{ status: 'stored', snapshot: object } | { status: 'invalid-snapshot' }}
 */
export function putLegacyMigrationUndo(snapshot) {
    if (!isValidSnapshot(snapshot)) {
        return { status: 'invalid-snapshot' };
    }

    const detached = cloneSnapshot(snapshot);
    if (detached.hadPreviousState) {
        detached.previousState = normalizeStateForWrite(detached.previousState);
    }
    detached.appliedState = normalizeStateForWrite(detached.appliedState);

    undoStore.set(detached.chatId, detached);

    return {
        status: 'stored',
        snapshot: cloneSnapshot(detached),
    };
}

/**
 * Retrieves a migration undo snapshot by chatId.
 *
 * @param {unknown} chatId
 * @returns {object | null}
 */
export function getLegacyMigrationUndo(chatId) {
    if (!isValidChatId(chatId)) {
        return null;
    }

    const found = undoStore.get(chatId);
    if (!found) {
        return null;
    }

    return cloneSnapshot(found);
}

/**
 * Determines whether a migration undo snapshot exists for the chatId.
 *
 * @param {unknown} chatId
 * @returns {boolean}
 */
export function hasLegacyMigrationUndo(chatId) {
    if (!isValidChatId(chatId)) {
        return false;
    }

    return undoStore.has(chatId);
}

/**
 * Removes the migration undo snapshot for the chatId.
 *
 * @param {unknown} chatId
 * @returns {boolean}
 */
export function removeLegacyMigrationUndo(chatId) {
    if (!isValidChatId(chatId)) {
        return false;
    }

    return undoStore.delete(chatId);
}

/**
 * Clears all session migration undo snapshots across all chats.
 */
export function clearAllLegacyMigrationUndos() {
    undoStore.clear();
}