import { ensurePanel, refreshPanelState } from './src/panel.js';

const LOG_PREFIX = '[Chromatic Dialogue]';

let lifecycleRegistered = false;
let chatListenerRegistered = false;
let initialized = false;
let initializationPromise = null;

/**
 * Register Chromatic Dialogue with SillyTavern's lifecycle.
 */
export function onActivate() {
    if (lifecycleRegistered) {
        return;
    }

    const { eventSource, eventTypes } = SillyTavern.getContext();

    eventSource.on(eventTypes.APP_INITIALIZED, initialize);
    lifecycleRegistered = true;
}

/**
 * Initialize exactly once, including concurrent calls.
 *
 * @returns {Promise<void>}
 */
async function initialize() {
    if (initialized) {
        return;
    }

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = initializeOnce();

    try {
        await initializationPromise;
        initialized = true;
    } catch (error) {
        initializationPromise = null;
        console.error(`${LOG_PREFIX} Failed to initialize.`, error);
    }
}

/**
 * Mount the panel and register chat-state refreshes.
 *
 * @returns {Promise<void>}
 */
async function initializeOnce() {
    await ensurePanel();

    if (!chatListenerRegistered) {
        const { eventSource, eventTypes } = SillyTavern.getContext();

        eventSource.on(eventTypes.CHAT_CHANGED, refreshPanelState);
        chatListenerRegistered = true;
    }

    refreshPanelState();
}
