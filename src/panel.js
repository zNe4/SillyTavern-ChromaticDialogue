import {
    EMPTY_CHAT_STATE_ID,
    EXTENSION_FOLDER,
    EXTENSIONS_SETTINGS_CONTAINER_ID,
    NO_CHAT_STATE_ID,
    PANEL_ID,
} from './constants.js';

/**
 * Create the extension settings panel if it is not already present.
 *
 * @returns {Promise<HTMLElement>}
 */
export async function ensurePanel() {
    const existingPanel = document.getElementById(PANEL_ID);

    if (existingPanel) {
        return existingPanel;
    }

    const container = document.getElementById(
        EXTENSIONS_SETTINGS_CONTAINER_ID,
    );

    if (!container) {
        throw new Error(
            `Missing SillyTavern settings container #${EXTENSIONS_SETTINGS_CONTAINER_ID}.`,
        );
    }

    const { renderExtensionTemplateAsync } = SillyTavern.getContext();
    const panelHtml = await renderExtensionTemplateAsync(
        EXTENSION_FOLDER,
        'settings',
    );

    container.insertAdjacentHTML('beforeend', panelHtml);

    const mountedPanel = document.getElementById(PANEL_ID);

    if (!mountedPanel) {
        throw new Error(`Template did not create #${PANEL_ID}.`);
    }

    return mountedPanel;
}

/**
 * Reflect whether SillyTavern currently has an active chat.
 *
 * Assignment rendering is intentionally deferred to later roadmap phases.
 */
export function refreshPanelState() {
    const panel = document.getElementById(PANEL_ID);

    if (!panel) {
        return;
    }

    const { chatId } = SillyTavern.getContext();
    const hasActiveChat =
        typeof chatId === 'string'
            ? chatId.trim().length > 0
            : Boolean(chatId);

    const noChatState = panel.querySelector(`#${NO_CHAT_STATE_ID}`);
    const emptyChatState = panel.querySelector(`#${EMPTY_CHAT_STATE_ID}`);

    if (noChatState) {
        noChatState.hidden = hasActiveChat;
    }

    if (emptyChatState) {
        emptyChatState.hidden = !hasActiveChat;
    }

    panel.dataset.chatState = hasActiveChat ? 'active' : 'none';
}
