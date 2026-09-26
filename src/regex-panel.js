import {
    REGEX_INTEGRATION_STATUS,
    REGEX_SCRIPT_STATUS,
    readRegexIntegrationStatus,
    repairRegexIntegration,
} from './regex-integration.js';

const panelStateMap = new WeakMap();

/**
 * Clear existing feedback on the Regex section feedback element.
 *
 * @param {HTMLElement|null} feedbackEl
 */
function clearFeedback(feedbackEl) {
    if (!feedbackEl) {
        return;
    }
    feedbackEl.textContent = '';
    if (feedbackEl.dataset) {
        delete feedbackEl.dataset.feedbackKind;
    }
    feedbackEl.hidden = true;
}

/**
 * Display visible, accessible status feedback on the Regex section.
 *
 * @param {HTMLElement|null} feedbackEl
 * @param {string} text
 * @param {'valid' | 'warning' | 'error'} kind
 */
function showFeedback(feedbackEl, text, kind) {
    if (!feedbackEl) {
        return;
    }
    feedbackEl.textContent = text;
    if (feedbackEl.dataset) {
        feedbackEl.dataset.feedbackKind = kind;
    }
    feedbackEl.hidden = false;
}

/**
 * Set semantic data attribute on a per-script status element.
 *
 * @param {HTMLElement} element
 * @param {string} statusValue
 */
function setRegexStatusAttr(element, statusValue) {
    if (element.dataset) {
        element.dataset.regexStatus = statusValue;
    }
    if (typeof element.setAttribute === 'function') {
        element.setAttribute('data-regex-status', statusValue);
    }
}

/**
 * Render a single Regex script status row.
 *
 * @param {HTMLElement} element
 * @param {{ status?: string } | null | undefined} script
 */
function renderScriptStatus(element, script) {
    const status = script?.status;
    if (status === REGEX_SCRIPT_STATUS.CURRENT) {
        element.textContent = 'Current';
        setRegexStatusAttr(element, 'current');
    } else if (status === REGEX_SCRIPT_STATUS.MISSING) {
        element.textContent = 'Missing';
        setRegexStatusAttr(element, 'missing');
    } else if (status === REGEX_SCRIPT_STATUS.OUTDATED) {
        element.textContent = 'Update available';
        setRegexStatusAttr(element, 'outdated');
    } else if (status === REGEX_SCRIPT_STATUS.CONFLICT) {
        element.textContent = 'Conflict';
        setRegexStatusAttr(element, 'conflict');
    } else {
        element.textContent = 'Unavailable';
        setRegexStatusAttr(element, 'unavailable');
    }
}

/**
 * Render the overall Regex inspection state to DOM elements.
 *
 * @param {ReturnType<typeof readRegexIntegrationStatus>} inspection
 * @param {HTMLElement} dialogueDisplayStatusEl
 * @param {HTMLElement} promptHygieneStatusEl
 * @param {HTMLElement} summaryEl
 * @param {HTMLButtonElement} repairBtn
 * @param {boolean} [isRepairing=false]
 */
function renderInspectionState(
    inspection,
    dialogueDisplayStatusEl,
    promptHygieneStatusEl,
    summaryEl,
    repairBtn,
    isRepairing = false,
) {
    const dialogueScript = Array.isArray(inspection?.scripts)
        ? inspection.scripts.find((s) => s?.key === 'dialogue-display')
        : null;
    const promptScript = Array.isArray(inspection?.scripts)
        ? inspection.scripts.find((s) => s?.key === 'prompt-hygiene')
        : null;

    renderScriptStatus(dialogueDisplayStatusEl, dialogueScript);
    renderScriptStatus(promptHygieneStatusEl, promptScript);

    const overallStatus = inspection?.status;

    if (overallStatus === REGEX_INTEGRATION_STATUS.CURRENT) {
        summaryEl.textContent = 'Required Regex scripts are up to date.';
        repairBtn.textContent = 'Regex up to date';
        repairBtn.disabled = true;
    } else if (overallStatus === REGEX_INTEGRATION_STATUS.NEEDS_REPAIR) {
        summaryEl.textContent = 'Required Regex scripts are missing or outdated.';
        repairBtn.textContent = 'Install / Update Regex';
        repairBtn.disabled = false;
    } else if (overallStatus === REGEX_INTEGRATION_STATUS.CONFLICT) {
        summaryEl.textContent =
            'Multiple matching Chromatic Dialogue Regex scripts were found. Resolve duplicates in SillyTavern Regex settings before continuing.';
        repairBtn.textContent = 'Resolve duplicates first';
        repairBtn.disabled = true;
    } else if (overallStatus === REGEX_INTEGRATION_STATUS.REGEX_DISABLED) {
        summaryEl.textContent =
            "SillyTavern's built-in Regex extension is disabled. Enable it before managing Chromatic Dialogue Regex scripts.";
        repairBtn.textContent = 'Enable Regex first';
        repairBtn.disabled = true;
    } else {
        summaryEl.textContent =
            'Regex integration is unavailable in this SillyTavern session.';
        repairBtn.textContent = 'Regex unavailable';
        repairBtn.disabled = true;
    }

    if (isRepairing) {
        repairBtn.textContent = 'Updating Regex…';
        repairBtn.disabled = true;
    }
}

/**
 * Controller entrypoint for the global Regex integration UI component.
 *
 * @param {ParentNode|null|undefined} panel
 * @param {{
 *     readRegexIntegrationStatus?: typeof readRegexIntegrationStatus,
 *     repairRegexIntegration?: typeof repairRegexIntegration,
 * }} [deps={}]
 */
export function refreshRegexIntegrationControl(panel, deps = {}) {
    if (!panel || typeof panel.querySelector !== 'function') {
        return;
    }

    const dialogueDisplayStatusEl = panel.querySelector(
        '#chromatic-dialogue-regex-dialogue-display-status',
    );
    const promptHygieneStatusEl = panel.querySelector(
        '#chromatic-dialogue-regex-prompt-hygiene-status',
    );
    const summaryEl = panel.querySelector('#chromatic-dialogue-regex-summary');
    const repairBtn = panel.querySelector('#chromatic-dialogue-regex-repair');
    const feedbackEl = panel.querySelector(
        '#chromatic-dialogue-regex-feedback',
    );

    if (
        !dialogueDisplayStatusEl ||
        !promptHygieneStatusEl ||
        !summaryEl ||
        !repairBtn ||
        !feedbackEl
    ) {
        return;
    }

    let state = panelStateMap.get(panel);
    if (!state) {
        state = {
            listenerAttached: false,
            isRepairing: false,
            deps,
        };
        panelStateMap.set(panel, state);
    } else {
        state.deps = deps;
    }

    if (!state.listenerAttached) {
        repairBtn.addEventListener('click', async () => {
            if (state.isRepairing) {
                return;
            }

            state.isRepairing = true;
            repairBtn.disabled = true;
            repairBtn.textContent = 'Updating Regex…';
            clearFeedback(feedbackEl);

            const activeDeps = state.deps || {};
            const repairFn =
                activeDeps.repairRegexIntegration ?? repairRegexIntegration;
            const readFn =
                activeDeps.readRegexIntegrationStatus ??
                readRegexIntegrationStatus;

            let result;
            try {
                result = await repairFn();
            } catch (error) {
                console.error(
                    '[Chromatic Dialogue] Failed to repair Regex integration:',
                    error,
                );
                state.isRepairing = false;
                const freshInspection = readFn();
                renderInspectionState(
                    freshInspection,
                    dialogueDisplayStatusEl,
                    promptHygieneStatusEl,
                    summaryEl,
                    repairBtn,
                    false,
                );
                showFeedback(
                    feedbackEl,
                    'The Regex integration operation failed. Check the browser console for details.',
                    'error',
                );
                return;
            }

            state.isRepairing = false;
            const freshInspection = readFn();
            renderInspectionState(
                freshInspection,
                dialogueDisplayStatusEl,
                promptHygieneStatusEl,
                summaryEl,
                repairBtn,
                false,
            );

            const status = result?.status;
            if (status === 'updated') {
                showFeedback(
                    feedbackEl,
                    'Required Regex scripts were installed or updated successfully.',
                    'valid',
                );
            } else if (status === 'updated-reload-failed') {
                showFeedback(
                    feedbackEl,
                    'Regex scripts were updated, but the current chat could not be reloaded. Reload the chat manually to refresh displayed dialogue.',
                    'warning',
                );
            } else if (status === 'already-current') {
                showFeedback(
                    feedbackEl,
                    'Required Regex scripts are already up to date.',
                    'valid',
                );
            } else if (status === 'save-error') {
                showFeedback(
                    feedbackEl,
                    'The Regex scripts could not be saved. No changes were kept.',
                    'error',
                );
            } else if (status === 'conflict') {
                showFeedback(
                    feedbackEl,
                    'Multiple matching Chromatic Dialogue Regex scripts were found. Resolve duplicates in SillyTavern Regex settings before continuing.',
                    'warning',
                );
            } else if (status === 'regex-disabled') {
                showFeedback(
                    feedbackEl,
                    "SillyTavern's built-in Regex extension is disabled. Enable it before managing Chromatic Dialogue Regex scripts.",
                    'warning',
                );
            } else if (status === 'unavailable') {
                showFeedback(
                    feedbackEl,
                    'Regex integration is unavailable in this SillyTavern session.',
                    'error',
                );
            } else {
                showFeedback(
                    feedbackEl,
                    'The Regex integration operation failed. Check the browser console for details.',
                    'error',
                );
            }
        });
        state.listenerAttached = true;
    }

    clearFeedback(feedbackEl);
    const readFn =
        state.deps?.readRegexIntegrationStatus ?? readRegexIntegrationStatus;
    const inspection = readFn();
    renderInspectionState(
        inspection,
        dialogueDisplayStatusEl,
        promptHygieneStatusEl,
        summaryEl,
        repairBtn,
        state.isRepairing,
    );
}