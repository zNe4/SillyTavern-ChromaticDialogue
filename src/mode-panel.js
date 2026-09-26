import {
    readActiveChatMode as defaultReadActiveChatMode,
    saveActiveChatMode as defaultSaveActiveChatMode,
} from './mode-store.js';

const MODE_LABELS = Object.freeze({
    off: 'Off',
    review: 'Review',
    automatic: 'Automatic',
});

const panelStates = new WeakMap();

function getOrCreatePanelState(panel) {
    let state = panelStates.get(panel);
    if (!state) {
        state = {
            listenerAttached: false,
            isSaving: false,
            lastChatId: undefined,
            deps: {
                readActiveChatMode: defaultReadActiveChatMode,
                saveActiveChatMode: defaultSaveActiveChatMode,
            },
        };
        panelStates.set(panel, state);
    }
    return state;
}

function clearFeedback(feedback) {
    if (!feedback) {
        return;
    }
    feedback.textContent = '';
    delete feedback.dataset.feedbackKind;
    feedback.hidden = true;
}

function showFeedback(feedback, message, kind = 'valid') {
    if (!feedback) {
        return;
    }
    feedback.textContent = message;
    feedback.dataset.feedbackKind = kind;
    feedback.hidden = false;
}

async function handleModeChange(panel, select, feedback, state) {
    if (state.isSaving) {
        return;
    }

    const { readActiveChatMode, saveActiveChatMode } = state.deps;
    const originState = readActiveChatMode();

    if (
        !originState ||
        originState.status !== 'ready' ||
        originState.chatId == null
    ) {
        select.value = 'review';
        select.disabled = true;
        clearFeedback(feedback);
        state.lastChatId = null;
        return;
    }

    const expectedChatId = originState.chatId;
    const previousMode = originState.mode;
    const requestedMode = select.value;

    if (requestedMode === previousMode) {
        select.value = previousMode;
        select.disabled = false;
        return;
    }

    state.isSaving = true;
    state.lastChatId = expectedChatId;
    select.disabled = true;
    clearFeedback(feedback);

    try {
        const saveResult = await saveActiveChatMode(expectedChatId, requestedMode);
        const freshState = readActiveChatMode();
        const isActiveChatSame =
            freshState?.status === 'ready' &&
            freshState.chatId === expectedChatId;

        if (saveResult?.status === 'saved') {
            if (isActiveChatSame && freshState.mode === requestedMode) {
                const label = MODE_LABELS[requestedMode] ?? requestedMode;
                showFeedback(feedback, `Operation mode saved: ${label}.`, 'valid');
                select.value = freshState.mode;
            } else {
                clearFeedback(feedback);
                if (freshState?.status === 'ready') {
                    select.value = freshState.mode;
                } else {
                    select.value = 'review';
                }
            }
        } else if (
            saveResult?.status === 'invalid-mode' ||
            saveResult?.status === 'invalid-state'
        ) {
            if (isActiveChatSame) {
                select.value = freshState.mode;
                const message =
                    saveResult.status === 'invalid-mode'
                        ? 'The selected operation mode is invalid.'
                        : 'The operation mode could not be saved for this chat.';
                showFeedback(feedback, message, 'error');
            } else {
                clearFeedback(feedback);
                if (freshState?.status === 'ready') {
                    select.value = freshState.mode;
                } else {
                    select.value = 'review';
                }
            }
        } else if (
            saveResult?.status === 'no-chat' ||
            saveResult?.status === 'chat-changed'
        ) {
            clearFeedback(feedback);
            if (freshState?.status === 'ready') {
                select.value = freshState.mode;
            } else {
                select.value = 'review';
            }
        } else {
            if (isActiveChatSame) {
                select.value = freshState.mode;
                showFeedback(
                    feedback,
                    'The operation mode could not be saved for this chat.',
                    'error',
                );
            } else {
                clearFeedback(feedback);
                if (freshState?.status === 'ready') {
                    select.value = freshState.mode;
                } else {
                    select.value = 'review';
                }
            }
        }
    } catch (error) {
        console.error('[Chromatic Dialogue] Failed to save operation mode:', error);
        const freshState = readActiveChatMode();
        const isActiveChatSame =
            freshState?.status === 'ready' &&
            freshState.chatId === expectedChatId;

        if (isActiveChatSame) {
            select.value = freshState.mode;
            showFeedback(
                feedback,
                'The operation mode could not be saved. Check the browser console for details.',
                'error',
            );
        } else {
            clearFeedback(feedback);
            if (freshState?.status === 'ready') {
                select.value = freshState.mode;
            } else {
                select.value = 'review';
            }
        }
    } finally {
        state.isSaving = false;
        const finalState = readActiveChatMode();
        if (finalState?.status === 'ready' && finalState.chatId != null) {
            select.disabled = false;
            select.value = finalState.mode;
            if (state.lastChatId !== finalState.chatId) {
                clearFeedback(feedback);
                state.lastChatId = finalState.chatId;
            }
        } else {
            select.disabled = true;
            select.value = 'review';
            clearFeedback(feedback);
            state.lastChatId = null;
        }
    }
}

export function refreshOperationModeControl(panel, deps = {}) {
    if (!panel || typeof panel.querySelector !== 'function') {
        return;
    }

    const select = panel.querySelector('#chromatic-dialogue-operation-mode');
    const feedback = panel.querySelector('#chromatic-dialogue-operation-mode-feedback');

    if (!select || !feedback) {
        return;
    }

    const resolvedDeps = {
        readActiveChatMode: deps.readActiveChatMode ?? defaultReadActiveChatMode,
        saveActiveChatMode: deps.saveActiveChatMode ?? defaultSaveActiveChatMode,
    };

    const state = getOrCreatePanelState(panel);
    state.deps = resolvedDeps;

    if (!state.listenerAttached) {
        select.addEventListener('change', () => {
            handleModeChange(panel, select, feedback, state);
        });
        state.listenerAttached = true;
    }

    const modeState = resolvedDeps.readActiveChatMode();

    if (modeState?.status === 'ready' && modeState.chatId != null) {
        const currentChatId = modeState.chatId;
        if (state.lastChatId !== undefined && state.lastChatId !== currentChatId) {
            clearFeedback(feedback);
        }
        state.lastChatId = currentChatId;
        select.value = modeState.mode;
        select.disabled = state.isSaving;
    } else {
        state.lastChatId = null;
        select.value = 'review';
        select.disabled = true;
        clearFeedback(feedback);
    }
}