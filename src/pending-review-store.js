const CANONICAL_ID_REGEX = /^c[1-9][0-9]?$/;
const CANONICAL_HEX_REGEX = /^#[0-9A-F]{6}$/;

/** @type {Map<string, Map<number, object>>} */
const store = new Map();

/** @type {Set<(event: object) => void>} */
const listeners = new Set();

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
        messageId >= 0
    );
}

/**
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

    return (
        proto === Object.prototype ||
        proto === null
    );
}

/**
 * @param {object} proposal
 * @returns {object}
 */
function cloneProposal(proposal) {
    return {
        id: proposal.id,
        name: proposal.name,
        proposedColor: proposal.proposedColor,
        color: proposal.color,
        colorAdjusted: proposal.colorAdjusted,
        contrastRatio: proposal.contrastRatio,
    };
}

/**
 * @param {object} review
 * @returns {object}
 */
function cloneReview(review) {
    return {
        chatId: review.chatId,
        messageId: review.messageId,
        proposals: review.proposals.map(cloneProposal),
    };
}

/**
 * @param {unknown} review
 * @returns {boolean}
 */
function isValidReview(review) {
    if (!isPlainObject(review)) {
        return false;
    }

    const reviewKeys = Object.keys(review);
    if (reviewKeys.length !== 3) {
        return false;
    }
    if (
        !reviewKeys.includes('chatId') ||
        !reviewKeys.includes('messageId') ||
        !reviewKeys.includes('proposals')
    ) {
        return false;
    }

    if (!isValidChatId(review.chatId)) {
        return false;
    }

    if (!isValidMessageId(review.messageId)) {
        return false;
    }

    if (!Array.isArray(review.proposals) || review.proposals.length === 0) {
        return false;
    }

    const seenIds = new Set();
    const seenNames = new Set();

    for (const proposal of review.proposals) {
        if (!isPlainObject(proposal)) {
            return false;
        }

        const propKeys = Object.keys(proposal);
        if (propKeys.length !== 6) {
            return false;
        }
        if (
            !propKeys.includes('id') ||
            !propKeys.includes('name') ||
            !propKeys.includes('proposedColor') ||
            !propKeys.includes('color') ||
            !propKeys.includes('colorAdjusted') ||
            !propKeys.includes('contrastRatio')
        ) {
            return false;
        }

        if (
            typeof proposal.id !== 'string' ||
            !CANONICAL_ID_REGEX.test(proposal.id)
        ) {
            return false;
        }
        if (seenIds.has(proposal.id)) {
            return false;
        }
        seenIds.add(proposal.id);

        if (
            typeof proposal.name !== 'string' ||
            proposal.name.trim().length === 0 ||
            proposal.name.trim() !== proposal.name
        ) {
            return false;
        }
        if (seenNames.has(proposal.name)) {
            return false;
        }
        seenNames.add(proposal.name);

        if (
            typeof proposal.proposedColor !== 'string' ||
            !CANONICAL_HEX_REGEX.test(proposal.proposedColor)
        ) {
            return false;
        }

        if (
            typeof proposal.color !== 'string' ||
            !CANONICAL_HEX_REGEX.test(proposal.color)
        ) {
            return false;
        }

        if (typeof proposal.colorAdjusted !== 'boolean') {
            return false;
        }

        if (
            typeof proposal.contrastRatio !== 'number' ||
            !Number.isFinite(proposal.contrastRatio) ||
            proposal.contrastRatio < 1 ||
            proposal.contrastRatio > 21
        ) {
            return false;
        }
    }

    return true;
}

/**
 * Notifies all registered listeners of a store change.
 *
 * @param {() => object} createEvent
 */
function notifyListeners(createEvent) {
    if (listeners.size === 0) {
        return;
    }

    const snapshot = Array.from(listeners);
    for (const listener of snapshot) {
        try {
            listener(createEvent());
        } catch {
            // Exceptions in listeners are isolated and must never disrupt store operations.
        }
    }
}

/**
 * Stores a pending review for character proposals.
 *
 * @param {unknown} review
 * @returns {{ status: 'stored', review: object } | { status: 'invalid-review' }}
 */
export function putPendingReview(review) {
    if (!isValidReview(review)) {
        return {
            status: 'invalid-review',
        };
    }

    const detached = cloneReview(review);

    let chatMap = store.get(detached.chatId);
    if (!chatMap) {
        chatMap = new Map();
        store.set(detached.chatId, chatMap);
    }

    chatMap.set(detached.messageId, detached);

    notifyListeners(() => ({
        type: 'stored',
        chatId: detached.chatId,
        messageId: detached.messageId,
    }));

    return {
        status: 'stored',
        review: cloneReview(detached),
    };
}

/**
 * Retrieves a pending review by chatId and messageId.
 *
 * @param {unknown} chatId
 * @param {unknown} messageId
 * @returns {object | null}
 */
export function getPendingReview(chatId, messageId) {
    if (!isValidChatId(chatId) || !isValidMessageId(messageId)) {
        return null;
    }

    const chatMap = store.get(chatId);
    if (!chatMap) {
        return null;
    }

    const stored = chatMap.get(messageId);
    if (!stored) {
        return null;
    }

    return cloneReview(stored);
}

/**
 * Lists all pending reviews for a chat, sorted ascending by messageId.
 *
 * @param {unknown} chatId
 * @returns {Array<object>}
 */
export function listPendingReviews(chatId) {
    if (!isValidChatId(chatId)) {
        return [];
    }

    const chatMap = store.get(chatId);
    if (!chatMap) {
        return [];
    }

    const list = Array.from(chatMap.values()).map(cloneReview);
    list.sort((a, b) => a.messageId - b.messageId);

    return list;
}

/**
 * Removes a specific pending review.
 *
 * @param {unknown} chatId
 * @param {unknown} messageId
 * @returns {boolean}
 */
export function removePendingReview(chatId, messageId) {
    if (!isValidChatId(chatId) || !isValidMessageId(messageId)) {
        return false;
    }

    const chatMap = store.get(chatId);
    if (!chatMap) {
        return false;
    }

    const existed = chatMap.delete(messageId);
    if (chatMap.size === 0) {
        store.delete(chatId);
    }

    if (existed) {
        notifyListeners(() => ({
            type: 'removed',
            chatId,
            messageId,
        }));
    }

    return existed;
}

/**
 * Clears all pending reviews for a single chat.
 *
 * @param {unknown} chatId
 * @returns {number}
 */
export function clearPendingReviewsForChat(chatId) {
    if (!isValidChatId(chatId)) {
        return 0;
    }

    const chatMap = store.get(chatId);
    if (!chatMap) {
        return 0;
    }

    const count = chatMap.size;
    store.delete(chatId);

    if (count > 0) {
        notifyListeners(() => ({
            type: 'chat-cleared',
            chatId,
        }));
    }

    return count;
}

/**
 * Clears all pending reviews across all chats.
 *
 * @returns {number}
 */
export function clearAllPendingReviews() {
    let count = 0;
    for (const chatMap of store.values()) {
        count += chatMap.size;
    }

    store.clear();

    if (count > 0) {
        notifyListeners(() => ({
            type: 'all-cleared',
        }));
    }

    return count;
}

/**
 * Returns pending review count.
 * With no arguments, returns total across all chats.
 * With an argument, returns count for that chatId or 0 if invalid.
 *
 * @param {...unknown} args
 * @returns {number}
 */
export function getPendingReviewCount(...args) {
    if (args.length === 0) {
        let total = 0;
        for (const chatMap of store.values()) {
            total += chatMap.size;
        }
        return total;
    }

    const chatId = args[0];
    if (!isValidChatId(chatId)) {
        return 0;
    }

    const chatMap = store.get(chatId);
    return chatMap ? chatMap.size : 0;
}

/**
 * Subscribes to pending review store changes.
 *
 * @param {unknown} listener
 * @returns {(() => boolean) | null}
 */
export function subscribePendingReviewChanges(listener) {
    if (typeof listener !== 'function') {
        return null;
    }

    listeners.add(listener);

    return function unsubscribe() {
        return listeners.delete(listener);
    };
}