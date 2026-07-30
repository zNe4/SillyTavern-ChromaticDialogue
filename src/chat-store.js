import { CHAT_METADATA_KEY } from './constants.js';
import {
    normalizeState,
    normalizeStateForWrite,
} from './domain.js';

/**
 * Determine whether a context identifies an active chat.
 *
 * @param {unknown} chatId
 * @returns {boolean}
 */
function hasActiveChatId(chatId) {
    return typeof chatId === 'string'
        ? chatId.trim().length > 0
        : Boolean(chatId);
}

/**
 * Read and normalize metadata for the currently active chat.
 *
 * A fresh SillyTavern context is obtained for every read. An unsupported
 * explicit schema version is reported without interpreting its contents.
 *
 * @returns {{
 *     status: 'no-chat' | 'ready' | 'unsupported-schema',
 *     chatId: string | null,
 *     state: ReturnType<typeof normalizeState>,
 * }}
 */
export function readActiveChatState() {
    const { chatId, chatMetadata } = SillyTavern.getContext();

    if (!hasActiveChatId(chatId)) {
        return {
            status: 'no-chat',
            chatId: null,
            state: null,
        };
    }

    const state = normalizeState(chatMetadata?.[CHAT_METADATA_KEY]);

    if (!state) {
        return {
            status: 'unsupported-schema',
            chatId,
            state: null,
        };
    }

    return {
        status: 'ready',
        chatId,
        state,
    };
}

/**
 * Persist a complete state only if the originating chat is still active.
 *
 * @param {string} expectedChatId
 * @param {unknown} candidate
 * @returns {Promise<{
 *     status: 'saved' | 'invalid-state' | 'no-chat' | 'chat-changed',
 *     chatId: string | null,
 *     state?: NonNullable<ReturnType<typeof normalizeStateForWrite>>,
 * }>}
 */
export async function saveActiveChatState(expectedChatId, candidate) {
    const state = normalizeStateForWrite(candidate);

    if (!state) {
        return {
            status: 'invalid-state',
            chatId: expectedChatId,
        };
    }

    const context = SillyTavern.getContext();

    if (!hasActiveChatId(context.chatId)) {
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

    context.chatMetadata[CHAT_METADATA_KEY] = state;
    await context.saveMetadata();

    const currentChatId = SillyTavern.getContext().chatId;

    if (currentChatId !== expectedChatId) {
        return {
            status: 'chat-changed',
	    chatId: hasActiveChatId(currentChatId)
                ? currentChatId
                : null,
        };
    }

    return {
        status: 'saved',
        chatId: expectedChatId,
        state,
    };
}
