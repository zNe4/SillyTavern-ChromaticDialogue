import { readActiveChatState } from './chat-store.js';
import { applyDialogueStyles } from './style-manager.js';

/**
 * Apply generated dialogue CSS for the currently active chat.
 *
 * No-chat and unsupported-schema results clear previously generated CSS.
 *
 * @param {Document} targetDocument
 * @returns {HTMLStyleElement}
 */
export function refreshDialogueStyles(targetDocument = document) {
    const { status, state } = readActiveChatState();

    const assignments =
        status === 'ready'
            ? state.assignments
            : null;

    return applyDialogueStyles(assignments, targetDocument);
}
