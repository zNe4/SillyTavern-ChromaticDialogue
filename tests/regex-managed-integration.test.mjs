import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    MANAGED_FIELDS,
    MANAGED_REGEX_SCRIPTS,
} from '../src/regex-definitions.js';
import { refreshRegexIntegrationControl } from '../src/regex-panel.js';

afterEach(() => {
    delete globalThis.SillyTavern;
});

/**
 * Build a canonical managed script matching production definitions with an arbitrary runtime UUID.
 */
function createCanonicalInstalledScript(canonical, id, overrides = {}) {
    const script = { id };
    for (const field of MANAGED_FIELDS) {
        if (Array.isArray(canonical[field])) {
            script[field] = [...canonical[field]];
        } else {
            script[field] = canonical[field];
        }
    }
    return { ...script, ...overrides };
}

/**
 * Construct an isolated fake DOM panel required by refreshRegexIntegrationControl.
 */
function createFakePanel() {
    const listeners = { click: [] };

    let dialogueText = 'Checking…';
    const dialogueDisplayStatus = {
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
    };

    let promptText = 'Checking…';
    const promptHygieneStatus = {
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
    };

    let summaryText = 'Checking required Regex scripts…';
    const summary = {
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
    };

    let buttonText = 'Check Regex';
    const button = {
        id: 'chromatic-dialogue-regex-repair',
        disabled: true,
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
        async click() {
            const handlers = listeners['click'] || [];
            for (const handler of handlers) {
                await handler({ type: 'click' });
            }
        },
    };

    let feedbackText = '';
    const feedback = {
        id: 'chromatic-dialogue-regex-feedback',
        dataset: {},
        hidden: true,
        get textContent() {
            return feedbackText;
        },
        set textContent(val) {
            feedbackText = String(val);
        },
        get innerHTML() {
            return feedbackText;
        },
        set innerHTML(_val) {
            throw new Error('innerHTML must not be used');
        },
    };

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

test('1. Clean installation: both scripts missing installs canonical scripts, persists, and reloads active chat', async () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus, summary, button, feedback } =
        createFakePanel();

    let uuidCount = 0;
    let saveCount = 0;
    let reloadCount = 0;
    const extensionSettings = { regex: [] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'active-chat-42',
                extensionSettings,
                uuidv4() {
                    uuidCount += 1;
                    return `generated-uuid-${uuidCount}`;
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
                async reloadCurrentChat() {
                    reloadCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);

    assert.equal(dialogueDisplayStatus.textContent, 'Missing');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'missing');
    assert.equal(promptHygieneStatus.textContent, 'Missing');
    assert.equal(promptHygieneStatus.dataset.regexStatus, 'missing');
    assert.equal(summary.textContent, 'Required Regex scripts are missing or outdated.');
    assert.equal(button.textContent, 'Install / Update Regex');
    assert.equal(button.disabled, false);

    await button.click();

    assert.equal(extensionSettings.regex.length, 2);
    assert.equal(extensionSettings.regex[0].scriptName, MANAGED_REGEX_SCRIPTS[0].scriptName);
    assert.equal(extensionSettings.regex[0].id, 'generated-uuid-1');
    assert.equal(extensionSettings.regex[0].key, undefined);
    assert.equal(extensionSettings.regex[1].scriptName, MANAGED_REGEX_SCRIPTS[1].scriptName);
    assert.equal(extensionSettings.regex[1].id, 'generated-uuid-2');
    assert.equal(extensionSettings.regex[1].key, undefined);

    for (const field of MANAGED_FIELDS) {
        if (Array.isArray(MANAGED_REGEX_SCRIPTS[0][field])) {
            assert.deepEqual(extensionSettings.regex[0][field], [...MANAGED_REGEX_SCRIPTS[0][field]]);
        } else {
            assert.equal(extensionSettings.regex[0][field], MANAGED_REGEX_SCRIPTS[0][field]);
        }
    }

    assert.equal(uuidCount, 2);
    assert.equal(saveCount, 1);
    assert.equal(reloadCount, 1);

    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'current');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(promptHygieneStatus.dataset.regexStatus, 'current');
    assert.equal(summary.textContent, 'Required Regex scripts are up to date.');
    assert.equal(button.textContent, 'Regex up to date');
    assert.equal(button.disabled, true);
    assert.equal(feedback.dataset.feedbackKind, 'valid');
    assert.equal(feedback.textContent, 'Required Regex scripts were installed or updated successfully.');
    assert.equal(feedback.hidden, false);
});

test('2. Clean installation with NO active chat installs scripts without calling reloadCurrentChat', async () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus, summary, button, feedback } =
        createFakePanel();

    let uuidCount = 0;
    let saveCount = 0;
    let reloadCount = 0;
    const extensionSettings = { regex: [] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: null,
                extensionSettings,
                uuidv4() {
                    uuidCount += 1;
                    return `generated-uuid-${uuidCount}`;
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
                async reloadCurrentChat() {
                    reloadCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);

    assert.equal(dialogueDisplayStatus.textContent, 'Missing');
    assert.equal(promptHygieneStatus.textContent, 'Missing');
    assert.equal(button.disabled, false);

    await button.click();

    assert.equal(extensionSettings.regex.length, 2);
    assert.equal(uuidCount, 2);
    assert.equal(saveCount, 1);
    assert.equal(reloadCount, 0);

    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(summary.textContent, 'Required Regex scripts are up to date.');
    assert.equal(button.textContent, 'Regex up to date');
    assert.equal(button.disabled, true);
    assert.equal(feedback.dataset.feedbackKind, 'valid');
    assert.equal(feedback.hidden, false);
});

test('3. One current, one missing: installs only the missing script, preserves unrelated scripts and relative ordering', async () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus, button } = createFakePanel();

    const unrelated1 = { id: 'unrelated-1', scriptName: 'Unrelated Filter 1' };
    const currentDisplay = createCanonicalInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'existing-display-uuid',
    );
    const unrelated2 = { id: 'unrelated-2', scriptName: 'Unrelated Filter 2' };

    let uuidCount = 0;
    let saveCount = 0;
    const extensionSettings = { regex: [unrelated1, currentDisplay, unrelated2] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: null,
                extensionSettings,
                uuidv4() {
                    uuidCount += 1;
                    return `generated-uuid-${uuidCount}`;
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);

    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'current');
    assert.equal(promptHygieneStatus.textContent, 'Missing');
    assert.equal(promptHygieneStatus.dataset.regexStatus, 'missing');
    assert.equal(button.disabled, false);

    await button.click();

    assert.equal(uuidCount, 1);
    assert.equal(saveCount, 1);
    assert.equal(extensionSettings.regex.length, 4);

    assert.strictEqual(extensionSettings.regex[0], unrelated1);
    assert.deepEqual(extensionSettings.regex[1], currentDisplay);
    assert.equal(extensionSettings.regex[1].id, 'existing-display-uuid');
    assert.strictEqual(extensionSettings.regex[2], unrelated2);

    assert.equal(
        extensionSettings.regex[3].scriptName,
        MANAGED_REGEX_SCRIPTS[1].scriptName,
    );
    assert.equal(extensionSettings.regex[3].id, 'generated-uuid-1');

    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(button.textContent, 'Regex up to date');
    assert.equal(button.disabled, true);
});

test('4. Outdated script repaired in place: preserves array position, id, custom fields, and generates no UUIDs', async () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus, button } = createFakePanel();

    const unrelatedA = { id: 'unrelated-a', scriptName: 'Other Script A' };
    const outdatedDisplay = createCanonicalInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'keep-this-id',
        {
            maxDepth: 99,
            userNote: 'keep me',
        },
    );
    const unrelatedB = { id: 'unrelated-b', scriptName: 'Other Script B' };
    const currentHygiene = createCanonicalInstalledScript(
        MANAGED_REGEX_SCRIPTS[1],
        'hygiene-uuid',
    );

    let uuidCount = 0;
    let saveCount = 0;
    const extensionSettings = {
        regex: [unrelatedA, outdatedDisplay, unrelatedB, currentHygiene],
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: null,
                extensionSettings,
                uuidv4() {
                    uuidCount += 1;
                    return `unexpected-uuid-${uuidCount}`;
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);

    assert.equal(dialogueDisplayStatus.textContent, 'Update available');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'outdated');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(promptHygieneStatus.dataset.regexStatus, 'current');
    assert.equal(button.disabled, false);

    await button.click();

    assert.equal(uuidCount, 0);
    assert.equal(saveCount, 1);
    assert.equal(extensionSettings.regex.length, 4);

    assert.strictEqual(extensionSettings.regex[0], unrelatedA);
    const repairedDisplay = extensionSettings.regex[1];
    assert.equal(repairedDisplay.id, 'keep-this-id');
    assert.equal(repairedDisplay.userNote, 'keep me');
    assert.equal(repairedDisplay.maxDepth, 50);
    assert.strictEqual(extensionSettings.regex[2], unrelatedB);
    assert.deepEqual(extensionSettings.regex[3], currentHygiene);

    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'current');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(button.textContent, 'Regex up to date');
    assert.equal(button.disabled, true);
});

test('5. Missing/invalid managed ID repaired: generates single runtime UUID in place', async () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus, button } = createFakePanel();

    const displayEmptyId = createCanonicalInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        '',
    );
    const currentHygiene = createCanonicalInstalledScript(
        MANAGED_REGEX_SCRIPTS[1],
        'hygiene-uuid',
    );

    let uuidCount = 0;
    let saveCount = 0;
    const extensionSettings = { regex: [displayEmptyId, currentHygiene] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: null,
                extensionSettings,
                uuidv4() {
                    uuidCount += 1;
                    return `generated-display-uuid-${uuidCount}`;
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);

    assert.equal(dialogueDisplayStatus.textContent, 'Update available');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'outdated');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(button.disabled, false);

    await button.click();

    assert.equal(uuidCount, 1);
    assert.equal(saveCount, 1);
    assert.equal(extensionSettings.regex.length, 2);
    assert.equal(extensionSettings.regex[0].id, 'generated-display-uuid-1');
    assert.equal(extensionSettings.regex[1].id, 'hygiene-uuid');

    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'current');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(button.disabled, true);
});

test('6. Mixed outdated and missing in one explicit action: atomically repairs and installs in one save', async () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus, button } = createFakePanel();

    const outdatedDisplay = createCanonicalInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'display-existing-uuid',
        { disabled: true },
    );

    let uuidCount = 0;
    let saveCount = 0;
    const extensionSettings = { regex: [outdatedDisplay] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: null,
                extensionSettings,
                uuidv4() {
                    uuidCount += 1;
                    return `hygiene-uuid-${uuidCount}`;
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);

    assert.equal(dialogueDisplayStatus.textContent, 'Update available');
    assert.equal(promptHygieneStatus.textContent, 'Missing');
    assert.equal(button.disabled, false);

    await button.click();

    assert.equal(uuidCount, 1);
    assert.equal(saveCount, 1);
    assert.equal(extensionSettings.regex.length, 2);
    assert.equal(extensionSettings.regex[0].id, 'display-existing-uuid');
    assert.equal(extensionSettings.regex[0].disabled, false);
    assert.equal(extensionSettings.regex[1].id, 'hygiene-uuid-1');
    assert.equal(
        extensionSettings.regex[1].scriptName,
        MANAGED_REGEX_SCRIPTS[1].scriptName,
    );

    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(button.textContent, 'Regex up to date');
    assert.equal(button.disabled, true);
});

test('7. Duplicate conflict blocks the UX safely with disabled button and no side effects', () => {
    const { panel, dialogueDisplayStatus, summary, button } = createFakePanel();

    const display1 = createCanonicalInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'dup-1',
    );
    const display2 = createCanonicalInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'dup-2',
    );
    const hygiene = createCanonicalInstalledScript(
        MANAGED_REGEX_SCRIPTS[1],
        'hygiene-uuid',
    );

    let uuidCount = 0;
    let saveCount = 0;
    let reloadCount = 0;
    const extensionSettings = { regex: [display1, display2, hygiene] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'active-chat-1',
                extensionSettings,
                uuidv4() {
                    uuidCount += 1;
                    return `unexpected-${uuidCount}`;
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
                async reloadCurrentChat() {
                    reloadCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);

    assert.equal(dialogueDisplayStatus.textContent, 'Conflict');
    assert.equal(dialogueDisplayStatus.dataset.regexStatus, 'conflict');
    assert.match(summary.textContent, /duplicates/i);
    assert.equal(button.textContent, 'Resolve duplicates first');
    assert.equal(button.disabled, true);

    assert.equal(extensionSettings.regex.length, 3);
    assert.equal(uuidCount, 0);
    assert.equal(saveCount, 0);
    assert.equal(reloadCount, 0);
});

test('8. Built-in Regex disabled blocks management with disabled button and no side effects', () => {
    const { panel, summary, button } = createFakePanel();

    let uuidCount = 0;
    let saveCount = 0;
    let reloadCount = 0;
    const extensionSettings = {
        disabledExtensions: ['regex'],
        regex: [],
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'active-chat-1',
                extensionSettings,
                uuidv4() {
                    uuidCount += 1;
                    return `unexpected-${uuidCount}`;
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
                async reloadCurrentChat() {
                    reloadCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);

    assert.match(summary.textContent, /built-in Regex extension is disabled/i);
    assert.equal(button.textContent, 'Enable Regex first');
    assert.equal(button.disabled, true);

    assert.deepEqual(extensionSettings.disabledExtensions, ['regex']);
    assert.deepEqual(extensionSettings.regex, []);
    assert.equal(uuidCount, 0);
    assert.equal(saveCount, 0);
    assert.equal(reloadCount, 0);
});

test('9. Save failure rolls back and UI reflects unrepaired state with error feedback', async () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus, button, feedback } =
        createFakePanel();

    let saveCount = 0;
    let reloadCount = 0;
    const initialRegexArray = [];
    const extensionSettings = { regex: initialRegexArray };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'active-chat-1',
                extensionSettings,
                uuidv4() {
                    return 'generated-uuid';
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                    throw new Error('Disk quota exceeded');
                },
                async reloadCurrentChat() {
                    reloadCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);
    assert.equal(button.disabled, false);

    await button.click();

    assert.equal(saveCount, 1);
    assert.strictEqual(extensionSettings.regex, initialRegexArray);
    assert.equal(reloadCount, 0);

    assert.equal(dialogueDisplayStatus.textContent, 'Missing');
    assert.equal(promptHygieneStatus.textContent, 'Missing');
    assert.equal(button.textContent, 'Install / Update Regex');
    assert.equal(button.disabled, false);
    assert.equal(feedback.dataset.feedbackKind, 'error');
    assert.equal(
        feedback.textContent,
        'The Regex scripts could not be saved. No changes were kept.',
    );
    assert.equal(feedback.hidden, false);
});

test('10. Reload failure keeps successful Regex update and produces warning feedback', async () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus, button, feedback } =
        createFakePanel();

    let saveCount = 0;
    let reloadCount = 0;
    const extensionSettings = { regex: [] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'active-chat-1',
                extensionSettings,
                uuidv4() {
                    return 'generated-uuid';
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
                async reloadCurrentChat() {
                    reloadCount += 1;
                    throw new Error('DOM chat reload failed');
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);
    assert.equal(button.disabled, false);

    await button.click();

    assert.equal(saveCount, 1);
    assert.equal(reloadCount, 1);
    assert.equal(extensionSettings.regex.length, 2);

    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(button.textContent, 'Regex up to date');
    assert.equal(button.disabled, true);
    assert.equal(feedback.dataset.feedbackKind, 'warning');
    assert.match(feedback.textContent, /Reload the chat manually/i);
    assert.equal(feedback.hidden, false);
});

test('11. Fresh context is dynamically retrieved at click time rather than retaining initial render context', async () => {
    const { panel, button } = createFakePanel();

    let saveCountA = 0;
    let saveCountB = 0;
    const contextA = {
        extensionSettings: { regex: [] },
        uuidv4: () => 'uuid-a',
        saveSettingsDebounced: () => {
            saveCountA += 1;
        },
    };
    const contextB = {
        extensionSettings: { regex: [] },
        uuidv4: () => 'uuid-b',
        saveSettingsDebounced: () => {
            saveCountB += 1;
        },
    };

    let activeContext = contextA;
    globalThis.SillyTavern = {
        getContext() {
            return activeContext;
        },
    };

    refreshRegexIntegrationControl(panel);
    assert.equal(button.disabled, false);

    activeContext = contextB;

    await button.click();

    assert.equal(contextA.extensionSettings.regex.length, 0);
    assert.equal(saveCountA, 0);

    assert.equal(contextB.extensionSettings.regex.length, 2);
    assert.equal(saveCountB, 1);
    assert.equal(button.textContent, 'Regex up to date');
    assert.equal(button.disabled, true);
});

test('12. State becoming conflict between render and click safely aborts mutation and disables button', async () => {
    const { panel, dialogueDisplayStatus, button, feedback } = createFakePanel();

    let uuidCount = 0;
    let saveCount = 0;
    let reloadCount = 0;
    const extensionSettings = { regex: [] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'active-chat-1',
                extensionSettings,
                uuidv4() {
                    uuidCount += 1;
                    return `uuid-${uuidCount}`;
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
                async reloadCurrentChat() {
                    reloadCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);
    assert.equal(button.disabled, false);

    extensionSettings.regex.push(
        createCanonicalInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'dup-a'),
        createCanonicalInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'dup-b'),
    );

    await button.click();

    assert.equal(uuidCount, 0);
    assert.equal(saveCount, 0);
    assert.equal(reloadCount, 0);
    assert.equal(extensionSettings.regex.length, 2);

    assert.equal(dialogueDisplayStatus.textContent, 'Conflict');
    assert.equal(button.textContent, 'Resolve duplicates first');
    assert.equal(button.disabled, true);
    assert.equal(feedback.dataset.feedbackKind, 'warning');
    assert.match(feedback.textContent, /duplicates/i);
    assert.equal(feedback.hidden, false);
});

test('13. Regex becoming disabled between render and click safely halts without changes', async () => {
    const { panel, summary, button, feedback } = createFakePanel();

    let uuidCount = 0;
    let saveCount = 0;
    let reloadCount = 0;
    const extensionSettings = { regex: [] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'active-chat-1',
                extensionSettings,
                uuidv4() {
                    uuidCount += 1;
                    return `uuid-${uuidCount}`;
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
                async reloadCurrentChat() {
                    reloadCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);
    assert.equal(button.disabled, false);

    extensionSettings.disabledExtensions = ['regex'];

    await button.click();

    assert.equal(uuidCount, 0);
    assert.equal(saveCount, 0);
    assert.equal(reloadCount, 0);
    assert.equal(extensionSettings.regex.length, 0);

    assert.match(summary.textContent, /built-in Regex extension is disabled/i);
    assert.equal(button.textContent, 'Enable Regex first');
    assert.equal(button.disabled, true);
    assert.equal(feedback.dataset.feedbackKind, 'warning');
    assert.match(feedback.textContent, /built-in Regex extension is disabled/i);
    assert.equal(feedback.hidden, false);
});

test('14. Unexpected UUID generation exception is caught, logged with Chromatic Dialogue prefix, and preserves state', async () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus, button, feedback } =
        createFakePanel();

    let saveCount = 0;
    let reloadCount = 0;
    const originalRegex = [];
    const extensionSettings = { regex: originalRegex };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'active-chat-1',
                extensionSettings,
                uuidv4() {
                    throw new Error('Entropy exhaustion failure');
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
                async reloadCurrentChat() {
                    reloadCount += 1;
                },
            };
        },
    };

    const originalConsoleError = console.error;
    const errorLogs = [];
    console.error = (...args) => errorLogs.push(args);

    try {
        refreshRegexIntegrationControl(panel);
        assert.equal(button.disabled, false);

        await button.click();

        assert.strictEqual(extensionSettings.regex, originalRegex);
        assert.equal(extensionSettings.regex.length, 0);
        assert.equal(saveCount, 0);
        assert.equal(reloadCount, 0);

        assert.equal(dialogueDisplayStatus.textContent, 'Missing');
        assert.equal(promptHygieneStatus.textContent, 'Missing');
        assert.equal(button.textContent, 'Install / Update Regex');
        assert.equal(button.disabled, false);
        assert.equal(feedback.dataset.feedbackKind, 'error');
        assert.equal(
            feedback.textContent,
            'The Regex integration operation failed. Check the browser console for details.',
        );
        assert.equal(feedback.hidden, false);

        assert.equal(errorLogs.length, 1);
        assert.match(String(errorLogs[0][0]), /\[Chromatic Dialogue\]/);
    } finally {
        console.error = originalConsoleError;
    }
});

test('15. Already-current race condition safely returns without UUID generation or save calls', async () => {
    const { panel, dialogueDisplayStatus, promptHygieneStatus, button, feedback } =
        createFakePanel();

    let uuidCount = 0;
    let saveCount = 0;
    let reloadCount = 0;
    const extensionSettings = { regex: [] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'active-chat-1',
                extensionSettings,
                uuidv4() {
                    uuidCount += 1;
                    return `uuid-${uuidCount}`;
                },
                saveSettingsDebounced() {
                    saveCount += 1;
                },
                async reloadCurrentChat() {
                    reloadCount += 1;
                },
            };
        },
    };

    refreshRegexIntegrationControl(panel);
    assert.equal(button.disabled, false);

    extensionSettings.regex = [
        createCanonicalInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'race-uuid-1'),
        createCanonicalInstalledScript(MANAGED_REGEX_SCRIPTS[1], 'race-uuid-2'),
    ];

    await button.click();

    assert.equal(uuidCount, 0);
    assert.equal(saveCount, 0);
    assert.equal(reloadCount, 0);

    assert.equal(dialogueDisplayStatus.textContent, 'Current');
    assert.equal(promptHygieneStatus.textContent, 'Current');
    assert.equal(button.textContent, 'Regex up to date');
    assert.equal(button.disabled, true);
    assert.equal(feedback.dataset.feedbackKind, 'valid');
    assert.equal(
        feedback.textContent,
        'Required Regex scripts are already up to date.',
    );
    assert.equal(feedback.hidden, false);
});
