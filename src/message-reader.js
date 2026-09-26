const MAX_SAFE_INTEGER_STRING = String(Number.MAX_SAFE_INTEGER);

/**
 * Validate and normalize a message ID to a safe non-negative integer.
 *
 * @param {unknown} messageId
 * @returns {number | null}
 */
function normalizeMessageId(messageId) {
    if (typeof messageId === 'number') {
        if (Object.is(messageId, -0)) {
            return null;
        }
        if (Number.isSafeInteger(messageId) && messageId >= 0) {
            return messageId;
        }
        return null;
    }

    if (typeof messageId === 'string') {
        if (!/^[0-9]+$/.test(messageId)) {
            return null;
        }
        const unpadded = messageId.replace(/^0+/, '') || '0';
        if (unpadded.length > MAX_SAFE_INTEGER_STRING.length) {
            return null;
        }
        if (
            unpadded.length === MAX_SAFE_INTEGER_STRING.length &&
            unpadded > MAX_SAFE_INTEGER_STRING
        ) {
            return null;
        }
        return Number(unpadded);
    }

    return null;
}

/**
 * Read the raw content of an assistant message from the active SillyTavern chat.
 *
 * @param {unknown} messageId
 * @returns {{
 *     status: 'ready' | 'invalid-message-id' | 'no-chat' | 'message-missing' | 'not-assistant-message' | 'invalid-message',
 *     chatId?: string | null,
 *     messageId?: number,
 *     message?: string,
 * }}
 */
export function readActiveAssistantMessage(messageId) {
    const normalizedMessageId = normalizeMessageId(messageId);

    if (normalizedMessageId === null) {
        return {
            status: 'invalid-message-id',
        };
    }

    let context;
    try {
        if (
            typeof SillyTavern === 'undefined' ||
            !SillyTavern ||
            typeof SillyTavern.getContext !== 'function'
        ) {
            return {
                status: 'no-chat',
                chatId: null,
            };
        }
        context = SillyTavern.getContext();
    } catch {
        return {
            status: 'no-chat',
            chatId: null,
        };
    }

    if (
        !context ||
        typeof context !== 'object' ||
        context.chatId === null ||
        context.chatId === undefined
    ) {
        return {
            status: 'no-chat',
            chatId: null,
        };
    }

    const chatId = context.chatId;

    if (!Array.isArray(context.chat)) {
        return {
            status: 'message-missing',
            chatId,
            messageId: normalizedMessageId,
        };
    }

    const message = context.chat[normalizedMessageId];

    if (!message || typeof message !== 'object' || Array.isArray(message)) {
        return {
            status: 'message-missing',
            chatId,
            messageId: normalizedMessageId,
        };
    }

    if (message.is_user === true || message.is_system === true) {
        return {
            status: 'not-assistant-message',
            chatId,
            messageId: normalizedMessageId,
        };
    }

    if (typeof message.mes !== 'string') {
        return {
            status: 'invalid-message',
            chatId,
            messageId: normalizedMessageId,
        };
    }

    return {
        status: 'ready',
        chatId,
        messageId: normalizedMessageId,
        message: message.mes,
    };
}