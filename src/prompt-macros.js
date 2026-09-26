// src/prompt-macros.js
import { readActiveChatState } from './chat-store.js';
import {
    buildCompactRegistryState,
    buildCompactRoster,
    getAssignmentCount,
    getNextFreeAssignmentId,
} from './registry.js';

const LOG_PREFIX = '[Chromatic Dialogue]';

let macrosRegistered = false;

/**
 * Synchronously evaluate the cdCount macro.
 *
 * @returns {string}
 */
function handleCdCount() {
    const activeChat = readActiveChatState();

    if (activeChat.status === 'unsupported-schema') {
        return 'unknown';
    }

    if (activeChat.status === 'ready') {
        return String(getAssignmentCount(activeChat.state));
    }

    return '0';
}

/**
 * Synchronously evaluate the cdNext macro.
 *
 * @returns {string}
 */
function handleCdNext() {
    const activeChat = readActiveChatState();

    if (activeChat.status === 'ready') {
        return getNextFreeAssignmentId(activeChat.state) ?? 'none';
    }

    return 'none';
}

/**
 * Synchronously evaluate the cdRoster macro.
 *
 * @returns {string}
 */
function handleCdRoster() {
    const activeChat = readActiveChatState();

    if (activeChat.status === 'ready') {
        return buildCompactRoster(activeChat.state);
    }

    return '';
}

/**
 * Synchronously evaluate the cdState macro.
 *
 * @returns {string}
 */
function handleCdState() {
    const activeChat = readActiveChatState();

    if (activeChat.status === 'unsupported-schema') {
        return 'count=unknown; roster=; next=none';
    }

    if (activeChat.status === 'ready') {
        return buildCompactRegistryState(activeChat.state);
    }

    return 'count=0; roster=; next=none';
}

/**
 * Register custom prompt macros with SillyTavern.
 *
 * @returns {boolean} True if registration succeeded, false if already registered or unavailable.
 */
export function registerPromptMacros() {
    if (macrosRegistered) {
        return false;
    }

    let context;

    try {
        context =
            typeof SillyTavern !== 'undefined' &&
            typeof SillyTavern.getContext === 'function'
                ? SillyTavern.getContext()
                : null;
    } catch {
        context = null;
    }

    if (!context?.macros?.register || typeof context.macros.register !== 'function') {
        console.warn(`${LOG_PREFIX} Macro registration API is unavailable.`);
        return false;
    }

    const { macros } = context;

    macros.register('cdCount', {
        description: 'Number of dialogue color assignments in the active chat',
        handler: handleCdCount,
    });

    macros.register('cdNext', {
        description: 'Next available dialogue assignment ID in the active chat',
        handler: handleCdNext,
    });

    macros.register('cdRoster', {
        description: 'Roster of character dialogue assignments in the active chat',
        handler: handleCdRoster,
    });

    macros.register('cdState', {
        description: 'Compact Chromatic Dialogue state for the active chat',
        handler: handleCdState,
    });

    macrosRegistered = true;
    return true;
}