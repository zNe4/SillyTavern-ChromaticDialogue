import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    REGEX_INTEGRATION_STATUS,
    REGEX_SCRIPT_STATUS,
} from '../src/regex-integration.js';
import { refreshRegexIntegrationControl } from '../src/regex-panel.js';

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function delay() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function createFakePanel(options = {}) {
    const listeners = { click: [] };

    let dialogueText = 'Checking…';
    const dialogueDisplayStatus = options.hasDialogueDisplay !== false ? {
        id: 'chromatic-dialogue-regex-dialogue-display-status',
        dataset: { regexStatus: 'unavailable' },
        get textContent() {
            return dialogueText;
        },
        set textContent(v) {
            dialogueText = String(v);
        },
        get innerHTML() {
            return dialogueText;
        },
        set innerHTML(_v) {
            throw new Error('innerHTML must not be used');
        },
        setAttribute(attr, val) {
            if (attr === 'data-regex-status') {
                this.dataset.regexStatus = String(val);
            }
        },
    } : null;

    let promptText = 'Checking…';
    const promptHygieneStatus = options.hasPromptHygiene !== false ? {
        id: 'chromatic-dialogue-regex-prompt-hygiene-status',
        dataset: { regexStatus: 'unavailable' },
        get textContent() {
            return promptText;
        },
        set textContent(v) {
            promptText = String(v);
        },
        get innerHTML() {
            return promptText;
        },
        set innerHTML(_v) {
            throw new Error('innerHTML must not be used');
        },
        setAttribute(attr, val) {
            if (attr === 'data-regex-status') {
                this.dataset.regexStatus = String(val);
            }
        },
    } : null;

    let summaryText = 'Checking required Regex scripts…';
    const summary = options.hasSummary !== false ? {
        id: 'chromatic-dialogue-regex-summary',
        get textContent() {
            return summaryText;
        },
        set textContent(v) {
            summaryText = String(v);
        },
        get innerHTML() {
            return summaryText;
        },
        set innerHTML(_v) {
            throw new Error('innerHTML must not be used');
        },
    } : null;

    let buttonText = 'Check Regex';
    const button = options.hasButton !== false ? {
        id: 'chromatic-dialogue-regex-repair',
        disabled: options.initialButtonDisabled ?? true,
        get textContent() {
            return buttonText;
        },
        set textContent(v) {
            buttonText = String(v);
        },
        get innerHTML() {
            return buttonText;
        },
        set innerHTML(_v) {
            throw new Error('innerHTML must not be used');
        },
        addEventListener(event, handler) {
            listeners[event] = listeners[event] || [];
            listeners[event].push(handler);
        },
        dispatchEvent(event) {
            const handlers = listeners[event.type] || [];
            for (const handler of handlers) {
                handler(event);
            }
        },
        click() {
            this.dispatchEvent({ type: 'click' });
        },
        get clickListeners() {
            return listeners.click || [];
        },
    } : null;

    let currentFeedbackText = '';
    const feedback = options.hasFeedback !== false ? {
        id: 'chromatic-dialogue-regex-feedback',
        dataset: {},
        hidden: true,
        get textContent() {
            return currentFeedbackText;
        },
        set textContent(val) {
            currentFeedbackText = String(val);
        },
        get innerHTML() {
            return currentFeedbackText;
        },
        set innerHTML(_val) {
            throw new Error('innerHTML must not be used');
        },
    } : null;

    const elements = {
        '#chromatic-dialogue-regex-dialogue-display-status': dialogueDisplayStatus,
        '#chromatic-dialogue-regex-prompt-hygiene-status': promptHygieneStatus,
        '#chromatic-dialogue-regex-summary': summary,
        '#chromatic-dialogue-regex-repair': button,
        '#chromatic-dialogue-regex-feedback': feedback,
    };

    const panel = {
        querySelector(selector) {
            return elements[selector] ?? null;
        },
    };

    return {
        panel,
        dialogueDisplayStatus,
        promptHygieneStatus,
        summary,
        button,
        feedback,
    };
}

function makeCurrentInspection() {
    return {
        status: REGEX_INTEGRATION_STATUS.CURRENT,
        regexExtensionDisabled: false,
        scripts: [
            {
                key: 'dialogue-display',
                scriptName: 'Chromatic Dialogue — Dialogue Display',
                status: REGEX_SCRIPT_STATUS.CURRENT,
                matchCount: 1,
                differingFields: [],
            },
            {
                key: 'prompt-hygiene',
                scriptName: 'Chromatic Dialogue — Prompt Hygiene',
                status: REGEX_SCRIPT_STATUS.CURRENT,
                matchCount: 1,
                differingFields: [],
            },
        ],
    };
}

function makeNeedsRepairInspection(dialogueStatus = REGEX_SCRIPT_STATUS.MISSING) {
    return {
        status: REGEX_INTEGRATION_STATUS.NEEDS_REPAIR,
        regexExtensionDisabled: false,
        scripts: [
            {
                key: 'dialogue-display',
                scriptName: 'Chromatic Dialogue — Dialogue Display',
                status: dialogueStatus,
                matchCount: dialogueStatus === REGEX_SCRIPT_STATUS.MISSING ? 0 : 1,
                differingFields: dialogueStatus === REGEX_SCRIPT_STATUS.OUTDATED ? ['findRegex'] : [],
            },
            {
                key: 'prompt-hygiene',
                scriptName: 'Chromatic Dialogue — Prompt Hygiene',
                status: REGEX_SCRIPT_STATUS.CURRENT,
                matchCount: 1,
                differingFields: [],
            },
        ],
    };
}

test('1: missing panel returns safely without throwing', () => {
    assert.doesNotThrow(() => {
        refreshRegexIntegrationControl(null);
        refreshRegexIntegrationControl(undefined);
        refreshRegexIntegrationControl({});
    });
});

test('2: missing dialogue display status element returns safely', () => {
    const { panel } = createFakePanel({ hasDialogueDisplay: false });
    assert.doesNotThrow(() => {
        refreshRegexIntegrationControl(panel);
    });
});

test('3: missing prompt hygiene status element returns safely', () => {
    const { panel } = createFakePanel({ hasPromptHygiene: false });
    assert.doesNotThrow(() => {
        refreshRegexIntegrationControl(panel);
    });
});

test('4: missing summary element returns safely', () => {
    const { panel } = createFakePanel({ hasSummary: false });
    assert.doesNotThrow(() => {
        refreshRegexIntegrationControl(panel);
    });
});

test('5: missing button element returns safely', () => {
    const { panel } = createFakePanel({ hasButton: false });
    assert.doesNotThrow(() => {
        refreshRegexIntegrationControl(panel);
    });
});

test('6: missing feedback element returns safely', () => {
    const { panel } = createFakePanel({ hasFeedback: false });
    assert.doesNotThrow(() => {
        refreshRegexIntegrationControl(panel);
    });
});

test('7: refresh calls readRegexIntegrationStatus but never repairRegexIntegration', () => {
    const { panel } = createFakePanel();
    let readCalls = 0;
    let repairCalls = 0;
    const deps = {
        readRegexIntegrationStatus: () => {
            readCalls++;
            return makeCurrentInspection();
        },
        repairRegexIntegration: async () => {
            repairCalls++;
            return { status: 'updated' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(readCalls, 1);
    assert.equal(repairCalls, 0);
});

test('8: CURRENT: both per-script statuses render Current', () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => makeCurrentInspection(),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'current');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(promptHygieneStatus.dataset.regexStatus, 'current');
});

test('9: CURRENT: current summary is correct', () => {
    const { panel, summary } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => makeCurrentInspection(),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(summary.textContent, 'Required Regex scripts are up to date.');
});

test('10: CURRENT: button reads Regex up to date and is disabled', () => {
    const { panel, button } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => makeCurrentInspection(),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(button.textContent, 'Regex up to date');
    assert.equal(button.disabled, true);
});

test('11: NEEDS_REPAIR: missing Dialogue Display renders Missing', () => {
    const { panel, dialogueDisplayStatus } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => makeNeedsRepairInspection(REGEX_SCRIPT_STATUS.MISSING),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(dialogueDisplayStatus.textContent, 'Missing');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'missing');
});

test('12: NEEDS_REPAIR: current Prompt Hygiene remains Current', () => {
    const { panel, promptHygieneStatus } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => makeNeedsRepairInspection(REGEX_SCRIPT_STATUS.MISSING),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(promptHygieneStatus.dataset.regexStatus, 'current');
});

test('13: NEEDS_REPAIR: overall summary reports missing or outdated', () => {
    const { panel, summary } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => makeNeedsRepairInspection(REGEX_SCRIPT_STATUS.MISSING),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(summary.textContent, 'Required Regex scripts are missing or outdated.');
});

test('14: NEEDS_REPAIR: button reads Install / Update Regex and is enabled', () => {
    const { panel, button } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => makeNeedsRepairInspection(REGEX_SCRIPT_STATUS.MISSING),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(button.textContent, 'Install / Update Regex');
    assert.equal(button.disabled, false);
});

test('15: NEEDS_REPAIR: outdated script renders Update available with status outdated', () => {
    const { panel, dialogueDisplayStatus } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => makeNeedsRepairInspection(REGEX_SCRIPT_STATUS.OUTDATED),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(dialogueDisplayStatus.textContent, 'Update available');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'outdated');
});

test('16: CONFLICT: conflicting script renders Conflict', () => {
    const { panel, dialogueDisplayStatus } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => ({
            status: REGEX_INTEGRATION_STATUS.CONFLICT,
            regexExtensionDisabled: false,
            scripts: [
                {
                    key: 'dialogue-display',
                    scriptName: 'Chromatic Dialogue — Dialogue Display',
                    status: REGEX_SCRIPT_STATUS.CONFLICT,
                    matchCount: 2,
                    differingFields: [],
                },
                {
                    key: 'prompt-hygiene',
                    scriptName: 'Chromatic Dialogue — Prompt Hygiene',
                    status: REGEX_SCRIPT_STATUS.CURRENT,
                    matchCount: 1,
                    differingFields: [],
                },
            ],
        }),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(dialogueDisplayStatus.textContent, 'Conflict');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'conflict');
});

test('17: CONFLICT: conflict summary instructs duplicate resolution', () => {
    const { panel, summary } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => ({
            status: REGEX_INTEGRATION_STATUS.CONFLICT,
            regexExtensionDisabled: false,
            scripts: [],
        }),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.match(summary.textContent, /duplicates/i);
});

test('18: CONFLICT: button is disabled with Resolve duplicates first', () => {
    const { panel, button } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => ({
            status: REGEX_INTEGRATION_STATUS.CONFLICT,
            regexExtensionDisabled: false,
            scripts: [],
        }),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(button.textContent, 'Resolve duplicates first');
    assert.equal(button.disabled, true);
});

test('19: REGEX_DISABLED: summary says built-in Regex is disabled', () => {
    const { panel, summary } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => ({
            status: REGEX_INTEGRATION_STATUS.REGEX_DISABLED,
            regexExtensionDisabled: true,
            scripts: [],
        }),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.match(summary.textContent, /built-in Regex extension is disabled/i);
});

test('20: REGEX_DISABLED: button is disabled with Enable Regex first', () => {
    const { panel, button } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => ({
            status: REGEX_INTEGRATION_STATUS.REGEX_DISABLED,
            regexExtensionDisabled: true,
            scripts: [],
        }),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(button.textContent, 'Enable Regex first');
    assert.equal(button.disabled, true);
});

test('21: REGEX_DISABLED: controller does not attempt repair or mutate settings', () => {
    const { panel } = createFakePanel();
    let repairCalled = false;
    const deps = {
        readRegexIntegrationStatus: () => ({
            status: REGEX_INTEGRATION_STATUS.REGEX_DISABLED,
            regexExtensionDisabled: true,
            scripts: [],
        }),
        repairRegexIntegration: async () => {
            repairCalled = true;
            return { status: 'regex-disabled' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(repairCalled, false);
});

test('22: UNAVAILABLE: per-script values fall back to Unavailable when script inspection is missing', () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => ({
            status: REGEX_INTEGRATION_STATUS.UNAVAILABLE,
            regexExtensionDisabled: false,
            scripts: [],
        }),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(dialogueDisplayStatus.textContent, 'Unavailable');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'unavailable');
    assert.equal(promptHygieneStatus.textContent, 'Unavailable');
    assert.equal(promptHygieneStatus.dataset.regexStatus, 'unavailable');
});

test('23: UNAVAILABLE: summary and disabled button reflect unavailable state', () => {
    const { panel, summary, button } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => ({
            status: REGEX_INTEGRATION_STATUS.UNAVAILABLE,
            regexExtensionDisabled: false,
            scripts: [],
        }),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(summary.textContent, 'Regex integration is unavailable in this SillyTavern session.');
    assert.equal(button.textContent, 'Regex unavailable');
    assert.equal(button.disabled, true);
});

test('24: exactly one click listener registered', () => {
    const { panel, button } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => makeCurrentInspection(),
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(button.clickListeners.length, 1);
});

test('25: repeated refresh does not duplicate click listener', () => {
    const { panel, button } = createFakePanel();
    const deps = {
        readRegexIntegrationStatus: () => makeCurrentInspection(),
    };
    refreshRegexIntegrationControl(panel, deps);
    refreshRegexIntegrationControl(panel, deps);
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(button.clickListeners.length, 1);
});

test('26: refreshed dependency injection replaces deps used by existing listener', async () => {
    const { panel, button } = createFakePanel();
    let initialRepairCalled = false;
    let updatedRepairCalled = false;

    const initialDeps = {
        readRegexIntegrationStatus: () => makeNeedsRepairInspection(),
        repairRegexIntegration: async () => {
            initialRepairCalled = true;
            return { status: 'updated' };
        },
    };
    refreshRegexIntegrationControl(panel, initialDeps);

    const updatedDeps = {
        readRegexIntegrationStatus: () => makeNeedsRepairInspection(),
        repairRegexIntegration: async () => {
            updatedRepairCalled = true;
            return { status: 'updated' };
        },
    };
    refreshRegexIntegrationControl(panel, updatedDeps);

    button.click();
    await delay();

    assert.equal(initialRepairCalled, false);
    assert.equal(updatedRepairCalled, true);
});

test('27: enabled click awaits repair exactly once', async () => {
    const { panel, button } = createFakePanel();
    let repairCalls = 0;
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: async () => {
            repairCalls++;
            inspection = makeCurrentInspection();
            return { status: 'updated' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    button.click();
    await delay();

    assert.equal(repairCalls, 1);
});

test('28: button becomes disabled / Updating Regex… while pending', async () => {
    const { panel, button } = createFakePanel();
    const deferred = createDeferred();
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: () => deferred.promise,
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(button.disabled, false);

    button.click();
    assert.equal(button.disabled, true);
    assert.equal(button.textContent, 'Updating Regex…');

    inspection = makeCurrentInspection();
    deferred.resolve({ status: 'updated' });
    await delay();

    assert.equal(button.disabled, true);
    assert.equal(button.textContent, 'Regex up to date');
});

test('29: repeated click while pending does not start second repair', async () => {
    const { panel, button } = createFakePanel();
    const deferred = createDeferred();
    let repairCalls = 0;
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: () => {
            repairCalls++;
            return deferred.promise;
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    button.click();
    assert.equal(repairCalls, 1);

    button.click();
    assert.equal(repairCalls, 1);

    inspection = makeCurrentInspection();
    deferred.resolve({ status: 'updated' });
    await delay();
});

test('30: after updated, controller performs fresh status read', async () => {
    const { panel, button } = createFakePanel();
    let reads = 0;
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => {
            reads++;
            return inspection;
        },
        repairRegexIntegration: async () => {
            inspection = makeCurrentInspection();
            return { status: 'updated' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(reads, 1);

    button.click();
    await delay();

    assert.ok(reads >= 2);
});

test('31: fresh Current state is rendered after updated', async () => {
    const { panel, button, dialogueDisplayStatus, promptHygieneStatus, summary } = createFakePanel();
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: async () => {
            inspection = makeCurrentInspection();
            return { status: 'updated' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(dialogueDisplayStatus.textContent, 'Missing');

    button.click();
    await delay();

    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(summary.textContent, 'Required Regex scripts are up to date.');
    assert.equal(button.textContent, 'Regex up to date');
    assert.equal(button.disabled, true);
});

test('32: success feedback is visible with kind valid', async () => {
    const { panel, button, feedback } = createFakePanel();
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: async () => {
            inspection = makeCurrentInspection();
            return { status: 'updated' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    button.click();
    await delay();

    assert.equal(feedback.dataset.feedbackKind, 'valid');
    assert.equal(
        feedback.textContent,
        'Required Regex scripts were installed or updated successfully.',
    );
    assert.equal(feedback.hidden, false);
});

test('33: repair is invoked only after explicit click, not from NEEDS_REPAIR render', () => {
    const { panel } = createFakePanel();
    let repairCalled = false;
    const deps = {
        readRegexIntegrationStatus: () => makeNeedsRepairInspection(),
        repairRegexIntegration: async () => {
            repairCalled = true;
            return { status: 'updated' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    assert.equal(repairCalled, false);
});

test('34: already-current result shows valid feedback and renders fresh state', async () => {
    const { panel, button, feedback } = createFakePanel();
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: async () => {
            inspection = makeCurrentInspection();
            return { status: 'already-current' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    button.click();
    await delay();

    assert.equal(feedback.dataset.feedbackKind, 'valid');
    assert.equal(feedback.textContent, 'Required Regex scripts are already up to date.');
    assert.equal(feedback.hidden, false);
    assert.equal(button.textContent, 'Regex up to date');
});

test('35: updated-reload-failed is treated as persisted success plus reload warning', async () => {
    const { panel, button, feedback } = createFakePanel();
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: async () => {
            inspection = makeCurrentInspection();
            return { status: 'updated-reload-failed' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    button.click();
    await delay();

    assert.equal(feedback.dataset.feedbackKind, 'warning');
    assert.match(feedback.textContent, /Reload the chat manually/i);
    assert.equal(feedback.hidden, false);
    assert.equal(button.textContent, 'Regex up to date');
});

test('36: save-error produces error feedback and renders fresh state', async () => {
    const { panel, button, feedback } = createFakePanel();
    const inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: async () => ({ status: 'save-error' }),
    };
    refreshRegexIntegrationControl(panel, deps);
    button.click();
    await delay();

    assert.equal(feedback.dataset.feedbackKind, 'error');
    assert.match(feedback.textContent, /could not be saved/i);
    assert.equal(feedback.hidden, false);
    assert.equal(button.textContent, 'Install / Update Regex');
    assert.equal(button.disabled, false);
});

test('37: conflict result produces warning feedback and fresh state', async () => {
    const { panel, button, feedback } = createFakePanel();
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: async () => {
            inspection = {
                status: REGEX_INTEGRATION_STATUS.CONFLICT,
                regexExtensionDisabled: false,
                scripts: [],
            };
            return { status: 'conflict' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    button.click();
    await delay();

    assert.equal(feedback.dataset.feedbackKind, 'warning');
    assert.match(feedback.textContent, /duplicates/i);
    assert.equal(button.textContent, 'Resolve duplicates first');
    assert.equal(button.disabled, true);
});

test('38: regex-disabled result produces warning feedback and fresh state', async () => {
    const { panel, button, feedback } = createFakePanel();
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: async () => {
            inspection = {
                status: REGEX_INTEGRATION_STATUS.REGEX_DISABLED,
                regexExtensionDisabled: true,
                scripts: [],
            };
            return { status: 'regex-disabled' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    button.click();
    await delay();

    assert.equal(feedback.dataset.feedbackKind, 'warning');
    assert.match(feedback.textContent, /built-in Regex extension is disabled/i);
    assert.equal(button.textContent, 'Enable Regex first');
    assert.equal(button.disabled, true);
});

test('39: unavailable result produces error feedback and fresh state', async () => {
    const { panel, button, feedback } = createFakePanel();
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: async () => {
            inspection = {
                status: REGEX_INTEGRATION_STATUS.UNAVAILABLE,
                regexExtensionDisabled: false,
                scripts: [],
            };
            return { status: 'unavailable' };
        },
    };
    refreshRegexIntegrationControl(panel, deps);
    button.click();
    await delay();

    assert.equal(feedback.dataset.feedbackKind, 'error');
    assert.match(feedback.textContent, /unavailable/i);
    assert.equal(button.textContent, 'Regex unavailable');
    assert.equal(button.disabled, true);
});

test('40: thrown repair error is caught and logged with Chromatic Dialogue prefix', async () => {
    const { panel, button } = createFakePanel();
    const originalConsoleError = console.error;
    const errorLogs = [];
    console.error = (...args) => errorLogs.push(args);

    try {
        const deps = {
            readRegexIntegrationStatus: () => makeNeedsRepairInspection(),
            repairRegexIntegration: async () => {
                throw new Error('Storage write failed');
            },
        };
        refreshRegexIntegrationControl(panel, deps);
        button.click();
        await delay();

        assert.equal(errorLogs.length, 1);
        assert.match(String(errorLogs[0][0]), /Chromatic Dialogue/);
    } finally {
        console.error = originalConsoleError;
    }
});

test('41: thrown error performs fresh status read, shows error feedback, and clears repairing flag', async () => {
    const { panel, button, feedback } = createFakePanel();
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        let reads = 0;
        const deps = {
            readRegexIntegrationStatus: () => {
                reads++;
                return makeNeedsRepairInspection();
            },
            repairRegexIntegration: async () => {
                throw new Error('Fatal crash');
            },
        };
        refreshRegexIntegrationControl(panel, deps);
        button.click();
        await delay();

        assert.ok(reads >= 2);
        assert.equal(feedback.dataset.feedbackKind, 'error');
        assert.equal(
            feedback.textContent,
            'The Regex integration operation failed. Check the browser console for details.',
        );
        assert.equal(feedback.hidden, false);
        assert.equal(button.disabled, false);
    } finally {
        console.error = originalConsoleError;
    }
});

test('42: handler does not throw to caller on error', async () => {
    const { panel, button } = createFakePanel();
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        const deps = {
            readRegexIntegrationStatus: () => makeNeedsRepairInspection(),
            repairRegexIntegration: async () => {
                throw new Error('Fatal crash');
            },
        };
        refreshRegexIntegrationControl(panel, deps);
        assert.doesNotThrow(() => {
            button.click();
        });
        await delay();
    } finally {
        console.error = originalConsoleError;
    }
});

test('43: visible status and feedback use textContent, never innerHTML', async () => {
    const { panel, button, dialogueDisplayStatus, promptHygieneStatus, summary, feedback } = createFakePanel();
    let inspection = makeNeedsRepairInspection();

    const deps = {
        readRegexIntegrationStatus: () => inspection,
        repairRegexIntegration: async () => {
            inspection = makeCurrentInspection();
            return { status: 'updated' };
        },
    };

    assert.doesNotThrow(() => {
        refreshRegexIntegrationControl(panel, deps);
        button.click();
    });
    await delay();

    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(summary.textContent, 'Required Regex scripts are up to date.');
    assert.equal(feedback.textContent, 'Required Regex scripts were installed or updated successfully.');
});

test('44: refresh clears prior feedback', () => {
    const { panel, feedback } = createFakePanel();
    feedback.textContent = 'Prior status';
    feedback.dataset.feedbackKind = 'valid';
    feedback.hidden = false;

    const deps = {
        readRegexIntegrationStatus: () => makeCurrentInspection(),
    };
    refreshRegexIntegrationControl(panel, deps);

    assert.equal(feedback.textContent, '');
    assert.equal(feedback.dataset.feedbackKind, undefined);
    assert.equal(feedback.hidden, true);
});

test('45: no direct SillyTavern metadata or context access in regex-panel.js', () => {
    const source = readFileSync(
        new URL('../src/regex-panel.js', import.meta.url),
        'utf8',
    );
    assert.doesNotMatch(source, /\bchatMetadata\b/);
    assert.doesNotMatch(source, /\bgetContext\b/);
    assert.doesNotMatch(source, /\bglobalThis\.SillyTavern\b/);
    assert.doesNotMatch(source, /\bextensionSettings\b/);
    assert.doesNotMatch(source, /\bsaveSettingsDebounced\b/);
    assert.doesNotMatch(source, /\buuidv4\b/);
    assert.doesNotMatch(source, /\breadActiveChatState\b/);
    assert.doesNotMatch(source, /\breadActiveChatMode\b/);
});

test('46: module export causes no side effects and exports expected function', async () => {
    const mod = await import('../src/regex-panel.js');
    assert.equal(typeof mod.refreshRegexIntegrationControl, 'function');
    assert.deepEqual(Object.keys(mod), ['refreshRegexIntegrationControl']);
});
