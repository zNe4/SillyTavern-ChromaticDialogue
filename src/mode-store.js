import {
    CHAT_MODE_METADATA_KEY,
    OPERATION_MODE_OFF,
    OPERATION_MODE_REVIEW,
    OPERATION_MODE_AUTOMATIC,
    DEFAULT_OPERATION_MODE,
} from './constants.js';

const VALID_MODES = new Set([
    OPERATION_MODE_OFF,
    OPERATION_MODE_REVIEW,
    OPERATION_MODE_AUTOMATIC,
]);

/**
 * Determine whether a mode string is valid and supported.
 *
 * @param {unknown} mode
 * @returns {boolean}
 */
function isValidMode(mode) {
    return typeof mode === 'string' && VALID_MODES.has(mode);
}

/**
 * Determine whether a chat ID identifies an active chat.
 *
 * @param {unknown} chatId
 * @returns {boolean}
 */
function hasActiveChatId(chatId) {
    if (chatId === null || chatId === undefined || Number.isNaN(chatId)) {
        return false;
    }
    if (typeof chatId === 'string') {
        return chatId.trim().length > 0;
    }
    return true;
}

/**
 * Read the operation mode for the currently active chat.
 *
 * A fresh SillyTavern context is obtained on every read. If no mode is stored
 * or stored data is invalid/corrupt, the default mode ('review') is returned safely.
 *
 * @returns {{
 *     status: 'no-chat' | 'ready',
 *     chatId: unknown | null,
 *     mode: string | null,
 * }}
 */
export function readActiveChatMode() {
    const context = globalThis.SillyTavern?.getContext?.();

    if (!context || !hasActiveChatId(context.chatId)) {
        return {
            status: 'no-chat',
            chatId: null,
            mode: null,
        };
    }

    const { chatId, chatMetadata } = context;

    if (
        !chatMetadata ||
        typeof chatMetadata !== 'object' ||
        Array.isArray(chatMetadata)
    ) {
        return {
            status: 'ready',
            chatId,
            mode: DEFAULT_OPERATION_MODE,
        };
    }

    if (
        Object.prototype.hasOwnProperty.call(
            chatMetadata,
            CHAT_MODE_METADATA_KEY,
        )
    ) {
        const storedMode = chatMetadata[CHAT_MODE_METADATA_KEY];
        if (isValidMode(storedMode)) {
            return {
                status: 'ready',
                chatId,
                mode: storedMode,
            };
        }
    }

    return {
        status: 'ready',
        chatId,
        mode: DEFAULT_OPERATION_MODE,
    };
}

/**
 * Persist an operation mode for the active chat.
 *
 * @param {unknown} expectedChatId
 * @param {unknown} mode
 * @returns {Promise<{
 *     status: 'saved' | 'invalid-mode' | 'invalid-state' | 'no-chat' | 'chat-changed',
 *     chatId: unknown | null,
 *     mode?: string,
 *     saved?: boolean,
 * }>}
 */
export async function saveActiveChatMode(expectedChatId, mode) {
    if (!isValidMode(mode)) {
        return {
            status: 'invalid-mode',
            chatId: expectedChatId,
        };
    }

    const context = globalThis.SillyTavern?.getContext?.();

    if (!context || !hasActiveChatId(context.chatId)) {
        return {
            status: 'no-chat',
            chatId: null,
        };
    }

    if (context.chatId !== expectedChatId) {
        return {
            status: 'chat-changed',
            chatId: context.chatId,
        };
    }

    const chatMetadata = context.chatMetadata;

    if (
        !chatMetadata ||
        typeof chatMetadata !== 'object' ||
        Array.isArray(chatMetadata)
    ) {
        return {
            status: 'invalid-state',
            chatId: expectedChatId,
        };
    }

    const hadPreviousMode = Object.prototype.hasOwnProperty.call(
        chatMetadata,
        CHAT_MODE_METADATA_KEY,
    );
    const previousMode = chatMetadata[CHAT_MODE_METADATA_KEY];

    chatMetadata[CHAT_MODE_METADATA_KEY] = mode;

    try {
        await context.saveMetadata();
    } catch (error) {
        if (hadPreviousMode) {
            chatMetadata[CHAT_MODE_METADATA_KEY] = previousMode;
        } else {
            delete chatMetadata[CHAT_MODE_METADATA_KEY];
        }

        throw error;
    }

    const postContext = globalThis.SillyTavern?.getContext?.();
    const currentChatId = postContext?.chatId;

    if (currentChatId !== expectedChatId) {
        return {
            status: 'chat-changed',
            chatId: hasActiveChatId(currentChatId) ? currentChatId : null,
            saved: true,
            mode,
        };
    }

    return {
        status: 'saved',
        chatId: expectedChatId,
        mode,
    };
}