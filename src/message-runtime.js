import {
    OPERATION_MODE_OFF,
    OPERATION_MODE_REVIEW,
    OPERATION_MODE_AUTOMATIC,
} from './constants.js';
import { enqueueAutomaticReview } from './automatic-review-controller.js';
import { inspectReceivedMessage } from './message-inspector.js';
import { readActiveChatMode } from './mode-store.js';
import { putPendingReview } from './pending-review-store.js';
import { resolveRuntimeOptions } from './runtime-options.js';

let registered = false;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidEventIdentifier(value) {
    return (
        (typeof value === 'string' && value.length > 0) ||
        typeof value === 'symbol'
    );
}

/**
 * Registers one SillyTavern MESSAGE_RECEIVED event handler for the current module instance.
 *
 * @returns {{
 *     status: 'registered' | 'already-registered' | 'unavailable',
 * }}
 */
export function registerMessageReceivedRuntime() {
    if (registered) {
        return {
            status: 'already-registered',
        };
    }

    if (!globalThis.SillyTavern || typeof globalThis.SillyTavern.getContext !== 'function') {
        return {
            status: 'unavailable',
        };
    }

    let context;
    try {
        context = globalThis.SillyTavern.getContext();
    } catch {
        return {
            status: 'unavailable',
        };
    }

    if (!context || typeof context !== 'object') {
        return {
            status: 'unavailable',
        };
    }

    if (!context.eventSource || typeof context.eventSource.on !== 'function') {
        return {
            status: 'unavailable',
        };
    }

    let eventType = null;
    if (isValidEventIdentifier(context.event_types?.MESSAGE_RECEIVED)) {
        eventType = context.event_types.MESSAGE_RECEIVED;
    } else if (isValidEventIdentifier(context.eventTypes?.MESSAGE_RECEIVED)) {
        eventType = context.eventTypes.MESSAGE_RECEIVED;
    }

    if (eventType === null) {
        return {
            status: 'unavailable',
        };
    }

    const handler = (messageId) => {
        try {
            const modeResult = readActiveChatMode();

            if (modeResult?.status !== 'ready') {
                return;
            }

            if (modeResult.mode === OPERATION_MODE_OFF) {
                return;
            }

            const optionsResult = resolveRuntimeOptions();

            if (optionsResult?.status !== 'ready') {
                return;
            }

            const result = inspectReceivedMessage(messageId, optionsResult.options);

            if (result?.status === 'ready') {
                if (result.chatId !== modeResult.chatId) {
                    return;
                }

                const review = {
                    chatId: result.chatId,
                    messageId: result.messageId,
                    proposals: result.proposals,
                };

                if (modeResult.mode === OPERATION_MODE_AUTOMATIC) {
                    void enqueueAutomaticReview(review);
                } else {
                    putPendingReview(review);
                }
            }
        } catch {
            // Silently stop handling the event
        }
    };

    try {
        context.eventSource.on(eventType, handler);
    } catch {
        return {
            status: 'unavailable',
        };
    }

    registered = true;

    return {
        status: 'registered',
    };
}
