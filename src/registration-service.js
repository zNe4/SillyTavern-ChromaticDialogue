import {
    readActiveChatState,
    saveActiveChatState,
} from './chat-store.js';
import { validateRegistrationProposals } from './proposal-validator.js';

/**
 * Create a deep copy of a dialogue state.
 *
 * @param {import('./domain.js').DialogueState} state
 * @returns {import('./domain.js').DialogueState}
 */
function cloneState(state) {
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
 * Validate and persist proposed character registrations into the currently active chat.
 *
 * @param {string} expectedChatId
 * @param {unknown} proposals
 * @param {object} [dependencies]
 * @param {typeof readActiveChatState} [dependencies.readActiveChatState]
 * @param {typeof saveActiveChatState} [dependencies.saveActiveChatState]
 * @param {typeof validateRegistrationProposals} [dependencies.validateRegistrationProposals]
 * @returns {Promise<{
 *     status: 'saved' | 'no-op' | 'no-chat' | 'chat-changed' | 'unsupported-schema' | 'rejected' | 'invalid-state',
 *     chatId?: string | null,
 *     state?: import('./domain.js').DialogueState,
 *     added?: Array<{ id: string, name: string, color: string }>,
 *     errors?: string[],
 * }>}
 */
export async function registerProposalsInActiveChat(
    expectedChatId,
    proposals,
    dependencies = {},
) {
    const {
        readActiveChatState: readChatState = readActiveChatState,
        saveActiveChatState: saveChatState = saveActiveChatState,
        validateRegistrationProposals: validateProposals = validateRegistrationProposals,
    } = dependencies;

    const activeChat = readChatState();

    if (activeChat.status === 'no-chat') {
        return {
            status: 'no-chat',
            chatId: null,
        };
    }

    if (activeChat.chatId !== expectedChatId) {
        return {
            status: 'chat-changed',
            chatId: activeChat.chatId,
        };
    }

    if (activeChat.status === 'unsupported-schema') {
        return {
            status: 'unsupported-schema',
            chatId: expectedChatId,
        };
    }

    const validation = validateProposals(activeChat.state, proposals);

    if (!validation.ok) {
        return {
            status: 'rejected',
            chatId: expectedChatId,
            errors: [...validation.errors],
        };
    }

    if (validation.proposals.length === 0) {
        return {
            status: 'no-op',
            chatId: expectedChatId,
            state: cloneState(activeChat.state),
            added: [],
        };
    }

    const candidate = cloneState(activeChat.state);

    for (const proposal of validation.proposals) {
        candidate.assignments[proposal.id] = {
            name: proposal.name,
            color: proposal.color,
        };
    }

    const saveResult = await saveChatState(expectedChatId, candidate);

    if (saveResult.status === 'saved') {
        return {
            status: 'saved',
            chatId: expectedChatId,
            state: cloneState(saveResult.state),
            added: validation.proposals.map(proposal => ({ ...proposal })),
        };
    }

    if (saveResult.status === 'no-chat') {
        return {
            status: 'no-chat',
            chatId: null,
        };
    }

    if (saveResult.status === 'chat-changed') {
        return {
            status: 'chat-changed',
            chatId: saveResult.chatId,
        };
    }

    if (saveResult.status === 'invalid-state') {
        return {
            status: 'invalid-state',
            chatId: expectedChatId,
        };
    }
}