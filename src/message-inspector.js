import { readActiveAssistantMessage } from './message-reader.js';
import { readActiveChatState } from './chat-store.js';
import { prepareRegistrationProposals } from './proposal-preparation.js';

/**
 * Inspect a received assistant message and prepare character registration proposals
 * without persisting metadata or modifying chat state.
 *
 * @param {unknown} messageId
 * @param {unknown} options
 * @returns {{
 *     status: 'ignored' | 'chat-changed' | 'no-proposals' | 'ready' | 'rejected' | 'unsupported-schema',
 *     reason?: string,
 *     chatId?: string | null,
 *     messageId?: number,
 *     currentChatId?: string | null,
 *     proposals?: Array<{
 *         id: string,
 *         name: string,
 *         proposedColor: string,
 *         color: string,
 *         colorAdjusted: boolean,
 *         contrastRatio: number,
 *     }>,
 *     errors?: string[],
 * }}
 */
export function inspectReceivedMessage(messageId, options) {
    const messageResult = readActiveAssistantMessage(messageId);

    if (messageResult.status !== 'ready') {
        return {
            status: 'ignored',
            reason: messageResult.status,
        };
    }

    const originChatId = messageResult.chatId;
    const normalizedMessageId = messageResult.messageId;

    let stateResult;
    try {
        stateResult = readActiveChatState();
    } catch {
        return {
            status: 'ignored',
            reason: 'state-unavailable',
            chatId: originChatId,
            messageId: normalizedMessageId,
        };
    }

    if (stateResult.status === 'no-chat') {
        return {
            status: 'chat-changed',
            chatId: originChatId,
            messageId: normalizedMessageId,
            currentChatId: null,
        };
    }

    if (stateResult.chatId !== originChatId) {
        return {
            status: 'chat-changed',
            chatId: originChatId,
            messageId: normalizedMessageId,
            currentChatId: stateResult.chatId,
        };
    }

    const proposalResult = prepareRegistrationProposals(
        messageResult.message,
        stateResult.state,
        options,
    );

    if (proposalResult.status === 'no-proposals') {
        return {
            status: 'no-proposals',
            chatId: originChatId,
            messageId: normalizedMessageId,
        };
    }

    if (proposalResult.status === 'ready') {
        return {
            status: 'ready',
            chatId: originChatId,
            messageId: normalizedMessageId,
            proposals: proposalResult.proposals.map(proposal => ({
                id: proposal.id,
                name: proposal.name,
                proposedColor: proposal.proposedColor,
                color: proposal.color,
                colorAdjusted: proposal.colorAdjusted,
                contrastRatio: proposal.contrastRatio,
            })),
        };
    }

    if (
        stateResult.status === 'unsupported-schema' &&
        proposalResult.status === 'registry-rejected'
    ) {
        return {
            status: 'unsupported-schema',
            chatId: originChatId,
            messageId: normalizedMessageId,
        };
    }

    return {
        status: 'rejected',
        chatId: originChatId,
        messageId: normalizedMessageId,
        reason: proposalResult.status,
        errors: Array.isArray(proposalResult.errors)
            ? [...proposalResult.errors]
            : [],
    };
}