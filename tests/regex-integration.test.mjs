import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    MANAGED_FIELDS,
    MANAGED_REGEX_SCRIPTS,
} from '../src/regex-definitions.js';
import {
    REGEX_INTEGRATION_STATUS,
    REGEX_SCRIPT_STATUS,
    inspectRegexIntegrationState,
    readRegexIntegrationStatus,
    repairRegexIntegration,
} from '../src/regex-integration.js';

afterEach(() => {
    delete globalThis.SillyTavern;
});

/**
 * Helper to build a valid installed script matching a canonical definition.
 */
function createMockInstalledScript(canonical, id, overrides = {}) {
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

test('1. module import has no side effects', () => {
    assert.equal(typeof inspectRegexIntegrationState, 'function');
    assert.equal(typeof readRegexIntegrationStatus, 'function');
    assert.equal(typeof repairRegexIntegration, 'function');
    assert.equal(globalThis.SillyTavern, undefined);
});

test('2. invalid extensionSettings -> unavailable', () => {
    for (const invalid of [null, undefined, 123, 'settings', true, []]) {
        const result = inspectRegexIntegrationState(invalid);
        assert.deepEqual(result, {
            status: REGEX_INTEGRATION_STATUS.UNAVAILABLE,
            regexExtensionDisabled: false,
            scripts: [],
        });
    }
});

test('3. absent regex property -> both scripts missing / needs-repair', () => {
    const result = inspectRegexIntegrationState({});
    assert.equal(result.status, REGEX_INTEGRATION_STATUS.NEEDS_REPAIR);
    assert.equal(result.regexExtensionDisabled, false);
    assert.equal(result.scripts.length, 2);

    for (const script of result.scripts) {
        assert.equal(script.status, REGEX_SCRIPT_STATUS.MISSING);
        assert.equal(script.matchCount, 0);
        assert.deepEqual(script.differingFields, []);
    }
});

test('4. null regex -> treated as empty', () => {
    const result = inspectRegexIntegrationState({ regex: null });
    assert.equal(result.status, REGEX_INTEGRATION_STATUS.NEEDS_REPAIR);
    assert.equal(result.scripts.length, 2);
    for (const script of result.scripts) {
        assert.equal(script.status, REGEX_SCRIPT_STATUS.MISSING);
    }
});

test('5. malformed non-array regex -> unavailable', () => {
    for (const malformed of ['not an array', 123, true, {}]) {
        const result = inspectRegexIntegrationState({ regex: malformed });
        assert.equal(result.status, REGEX_INTEGRATION_STATUS.UNAVAILABLE);
        assert.deepEqual(result.scripts, []);
    }
});

test('6. both exact current scripts with arbitrary runtime UUIDs -> current', () => {
    const installedDisplay = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'arbitrary-runtime-uuid-a',
    );
    const installedHygiene = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[1],
        'arbitrary-runtime-uuid-b',
    );

    const result = inspectRegexIntegrationState({
        regex: [installedDisplay, installedHygiene],
    });

    assert.equal(result.status, REGEX_INTEGRATION_STATUS.CURRENT);
    assert.equal(result.regexExtensionDisabled, false);
    assert.equal(result.scripts[0].status, REGEX_SCRIPT_STATUS.CURRENT);
    assert.equal(result.scripts[0].matchCount, 1);
    assert.deepEqual(result.scripts[0].differingFields, []);
    assert.equal(result.scripts[1].status, REGEX_SCRIPT_STATUS.CURRENT);
    assert.equal(result.scripts[1].matchCount, 1);
    assert.deepEqual(result.scripts[1].differingFields, []);
});

test('7. canonical JSON asset IDs are not required', () => {
    const installedDisplay = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'my-custom-uuid-1',
    );
    const installedHygiene = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[1],
        'my-custom-uuid-2',
    );

    assert.notEqual(installedDisplay.id, 'chromatic-dialogue-dialogue-display');
    assert.notEqual(installedHygiene.id, 'chromatic-dialogue-hide-control-records');

    const result = inspectRegexIntegrationState({
        regex: [installedDisplay, installedHygiene],
    });

    assert.equal(result.status, REGEX_INTEGRATION_STATUS.CURRENT);
});

test('8. one missing -> needs-repair', () => {
    const installedDisplay = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'uuid-1',
    );

    const result = inspectRegexIntegrationState({
        regex: [installedDisplay],
    });

    assert.equal(result.status, REGEX_INTEGRATION_STATUS.NEEDS_REPAIR);
    assert.equal(result.scripts[0].status, REGEX_SCRIPT_STATUS.CURRENT);
    assert.equal(result.scripts[1].status, REGEX_SCRIPT_STATUS.MISSING);
});

test('9. one managed field differs -> outdated', () => {
    const installedDisplay = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'uuid-1',
        { disabled: true },
    );
    const installedHygiene = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[1],
        'uuid-2',
    );

    const result = inspectRegexIntegrationState({
        regex: [installedDisplay, installedHygiene],
    });

    assert.equal(result.status, REGEX_INTEGRATION_STATUS.NEEDS_REPAIR);
    assert.equal(result.scripts[0].status, REGEX_SCRIPT_STATUS.OUTDATED);
    assert.deepEqual(result.scripts[0].differingFields, ['disabled']);
    assert.equal(result.scripts[1].status, REGEX_SCRIPT_STATUS.CURRENT);
});

test('10. multiple managed fields differ -> deterministic differingFields', () => {
    const installedDisplay = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'uuid-1',
        {
            findRegex: '/modified/g',
            replaceString: 'changed',
            runOnEdit: false,
        },
    );

    const result = inspectRegexIntegrationState({
        regex: [installedDisplay],
    });

    assert.deepEqual(result.scripts[0].differingFields, [
        'findRegex',
        'replaceString',
        'runOnEdit',
    ]);
});

test('11. missing/invalid installed id -> outdated with id', () => {
    for (const invalidId of ['', '   ', null, undefined, 123]) {
        const installedDisplay = createMockInstalledScript(
            MANAGED_REGEX_SCRIPTS[0],
            invalidId,
        );

        const result = inspectRegexIntegrationState({
            regex: [installedDisplay],
        });

        assert.equal(result.scripts[0].status, REGEX_SCRIPT_STATUS.OUTDATED);
        assert.ok(
            result.scripts[0].differingFields.includes('id'),
            `Field "id" must be flagged as differing for ID: ${invalidId}`,
        );
    }
});

test('12. unrelated extra fields do not make a script outdated', () => {
    const installedDisplay = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'uuid-1',
        {
            userNote: 'custom comment',
            customOrder: 42,
        },
    );
    const installedHygiene = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[1],
        'uuid-2',
    );

    const result = inspectRegexIntegrationState({
        regex: [installedDisplay, installedHygiene],
    });

    assert.equal(result.status, REGEX_INTEGRATION_STATUS.CURRENT);
    assert.equal(result.scripts[0].status, REGEX_SCRIPT_STATUS.CURRENT);
    assert.deepEqual(result.scripts[0].differingFields, []);
});

test('13. unrelated global scripts are ignored by inspection', () => {
    const unrelatedScript = {
        id: 'unrelated-1',
        scriptName: 'Some third-party regex',
        findRegex: '/foo/g',
        replaceString: 'bar',
    };
    const installedDisplay = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'uuid-1',
    );
    const installedHygiene = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[1],
        'uuid-2',
    );

    const result = inspectRegexIntegrationState({
        regex: [unrelatedScript, installedDisplay, installedHygiene],
    });

    assert.equal(result.status, REGEX_INTEGRATION_STATUS.CURRENT);
    assert.equal(result.scripts.length, 2);
});

test('14. exact scriptName matching is case-sensitive', () => {
    const lowercaseScript = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'uuid-1',
        { scriptName: 'chromatic dialogue - dialogue display' },
    );

    const result = inspectRegexIntegrationState({
        regex: [lowercaseScript],
    });

    assert.equal(result.scripts[0].status, REGEX_SCRIPT_STATUS.MISSING);
});

test('15. duplicate display names -> conflict', () => {
    const display1 = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'uuid-1');
    const display2 = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'uuid-2');
    const hygiene = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[1], 'uuid-3');

    const result = inspectRegexIntegrationState({
        regex: [display1, display2, hygiene],
    });

    assert.equal(result.status, REGEX_INTEGRATION_STATUS.CONFLICT);
    assert.equal(result.scripts[0].status, REGEX_SCRIPT_STATUS.CONFLICT);
    assert.equal(result.scripts[0].matchCount, 2);
    assert.deepEqual(result.scripts[0].differingFields, []);
});

test('16. duplicate prompt-hygiene names -> conflict', () => {
    const display = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'uuid-1');
    const hygiene1 = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[1], 'uuid-2');
    const hygiene2 = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[1], 'uuid-3');

    const result = inspectRegexIntegrationState({
        regex: [display, hygiene1, hygiene2],
    });

    assert.equal(result.status, REGEX_INTEGRATION_STATUS.CONFLICT);
    assert.equal(result.scripts[1].status, REGEX_SCRIPT_STATUS.CONFLICT);
    assert.equal(result.scripts[1].matchCount, 2);
    assert.deepEqual(result.scripts[1].differingFields, []);
});

test('17. Regex extension disabled -> overall regex-disabled while preserving per-script inspection', () => {
    const display = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'uuid-1');
    const hygiene = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[1], 'uuid-2');

    const result = inspectRegexIntegrationState({
        disabledExtensions: ['regex', 'other-ext'],
        regex: [display, hygiene],
    });

    assert.equal(result.status, REGEX_INTEGRATION_STATUS.REGEX_DISABLED);
    assert.equal(result.regexExtensionDisabled, true);
    assert.equal(result.scripts[0].status, REGEX_SCRIPT_STATUS.CURRENT);
    assert.equal(result.scripts[1].status, REGEX_SCRIPT_STATUS.CURRENT);
});

test('18. returned inspection cannot mutate canonical definitions or installed scripts', () => {
    const installed = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'uuid-1');
    const result = inspectRegexIntegrationState({ regex: [installed] });

    result.scripts[0].differingFields.push('tampered');
    result.scripts.push({ key: 'fake' });

    assert.equal(MANAGED_REGEX_SCRIPTS.length, 2);
    assert.equal(Object.keys(installed).includes('tampered'), false);
});

test('19. readRegexIntegrationStatus calls getContext fresh on each invocation', () => {
    let contextCalls = 0;
    const contexts = [
        {
            extensionSettings: { regex: [] },
        },
        {
            extensionSettings: {
                regex: [
                    createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'uuid-1'),
                    createMockInstalledScript(MANAGED_REGEX_SCRIPTS[1], 'uuid-2'),
                ],
            },
        },
    ];

    globalThis.SillyTavern = {
        getContext() {
            return contexts[contextCalls++];
        },
    };

    const first = readRegexIntegrationStatus();
    assert.equal(first.status, REGEX_INTEGRATION_STATUS.NEEDS_REPAIR);

    const second = readRegexIntegrationStatus();
    assert.equal(second.status, REGEX_INTEGRATION_STATUS.CURRENT);

    assert.equal(contextCalls, 2);
});

test('20. repair: missing both appends in canonical order, generates 2 UUIDs, preserves unrelated scripts', async () => {
    const unrelated = { id: 'unrelated-1', scriptName: 'Other Script' };
    const extensionSettings = { regex: [unrelated] };
    let uuidCalls = 0;
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                extensionSettings,
                uuidv4() {
                    uuidCalls += 1;
                    return `generated-uuid-${uuidCalls}`;
                },
                saveSettingsDebounced() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'updated');
    assert.equal(result.inspection.status, REGEX_INTEGRATION_STATUS.CURRENT);
    assert.equal(saveCalls, 1);
    assert.equal(uuidCalls, 2);

    assert.equal(extensionSettings.regex.length, 3);
    assert.strictEqual(extensionSettings.regex[0], unrelated);

    assert.equal(
        extensionSettings.regex[1].scriptName,
        MANAGED_REGEX_SCRIPTS[0].scriptName,
    );
    assert.equal(extensionSettings.regex[1].id, 'generated-uuid-1');
    assert.equal(extensionSettings.regex[1].key, undefined);

    assert.equal(
        extensionSettings.regex[2].scriptName,
        MANAGED_REGEX_SCRIPTS[1].scriptName,
    );
    assert.equal(extensionSettings.regex[2].id, 'generated-uuid-2');
    assert.equal(extensionSettings.regex[2].key, undefined);
});

test('21. repair: missing one installs only the missing script without duplicating existing', async () => {
    const existingDisplay = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'existing-uuid-1',
    );
    const extensionSettings = { regex: [existingDisplay] };
    let uuidCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                extensionSettings,
                uuidv4() {
                    uuidCalls += 1;
                    return `new-uuid-${uuidCalls}`;
                },
                saveSettingsDebounced() {},
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'updated');
    assert.equal(uuidCalls, 1);
    assert.equal(extensionSettings.regex.length, 2);
    assert.equal(extensionSettings.regex[0].id, 'existing-uuid-1');
    assert.equal(extensionSettings.regex[1].id, 'new-uuid-1');
    assert.equal(
        extensionSettings.regex[1].scriptName,
        MANAGED_REGEX_SCRIPTS[1].scriptName,
    );
});

test('22. repair: outdated existing repairs managed fields and preserves id, extra fields, array position', async () => {
    const unrelated = { id: 'unrelated-1', scriptName: 'Other' };
    const outdatedDisplay = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'preserve-this-id',
        {
            disabled: true,
            markdownOnly: false,
            userCustomField: 'keep-this-value',
        },
    );
    const currentHygiene = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[1],
        'hygiene-id',
    );
    const extensionSettings = {
        regex: [unrelated, outdatedDisplay, currentHygiene],
    };
    let uuidCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                extensionSettings,
                uuidv4() {
                    uuidCalls += 1;
                    return 'unexpected-uuid';
                },
                saveSettingsDebounced() {},
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'updated');
    assert.equal(uuidCalls, 0);
    assert.equal(extensionSettings.regex.length, 3);
    assert.strictEqual(extensionSettings.regex[0], unrelated);

    const repaired = extensionSettings.regex[1];
    assert.equal(repaired.id, 'preserve-this-id');
    assert.equal(repaired.disabled, false);
    assert.equal(repaired.markdownOnly, true);
    assert.equal(repaired.userCustomField, 'keep-this-value');
    assert.equal(repaired.key, undefined);
});

test('23. repair: missing ID generates new UUID and preserves position', async () => {
    const displayWithoutId = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        '',
    );
    const currentHygiene = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[1],
        'hygiene-id',
    );
    const extensionSettings = {
        regex: [displayWithoutId, currentHygiene],
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                extensionSettings,
                uuidv4() {
                    return 'generated-id-for-display';
                },
                saveSettingsDebounced() {},
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'updated');
    assert.equal(extensionSettings.regex[0].id, 'generated-id-for-display');
    assert.equal(extensionSettings.regex[1].id, 'hygiene-id');
});

test('24. repair: mixed missing and outdated repairs atomically in one save', async () => {
    const outdatedDisplay = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[0],
        'display-uuid',
        { disabled: true },
    );
    const extensionSettings = { regex: [outdatedDisplay] };
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                extensionSettings,
                uuidv4() {
                    return 'hygiene-new-uuid';
                },
                saveSettingsDebounced() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'updated');
    assert.equal(saveCalls, 1);
    assert.equal(extensionSettings.regex.length, 2);
    assert.equal(extensionSettings.regex[0].disabled, false);
    assert.equal(extensionSettings.regex[1].id, 'hygiene-new-uuid');
});

test('25. repair: already current returns already-current without save or UUID generation', async () => {
    const display = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'uuid-1');
    const hygiene = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[1], 'uuid-2');
    const extensionSettings = { regex: [display, hygiene] };
    let saveCalls = 0;
    let uuidCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                extensionSettings,
                uuidv4() {
                    uuidCalls += 1;
                },
                saveSettingsDebounced() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'already-current');
    assert.equal(saveCalls, 0);
    assert.equal(uuidCalls, 0);
});

test('26. repair: conflict returns conflict with no mutation', async () => {
    const display1 = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'uuid-1');
    const display2 = createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'uuid-2');
    const extensionSettings = { regex: [display1, display2] };
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                extensionSettings,
                uuidv4() {
                    throw new Error('Must not be called');
                },
                saveSettingsDebounced() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'conflict');
    assert.equal(saveCalls, 0);
    assert.equal(extensionSettings.regex.length, 2);
});

test('27. repair: regex disabled returns regex-disabled without mutating settings', async () => {
    const extensionSettings = {
        disabledExtensions: ['regex'],
        regex: [],
    };
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                extensionSettings,
                uuidv4() {},
                saveSettingsDebounced() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'regex-disabled');
    assert.equal(saveCalls, 0);
    assert.deepEqual(extensionSettings.disabledExtensions, ['regex']);
    assert.deepEqual(extensionSettings.regex, []);
});

test('28. repair: unavailable required APIs return unavailable without mutation', async () => {
    const extensionSettings = { regex: [] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                extensionSettings,
                // uuidv4 and saveSettingsDebounced missing
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'unavailable');
    assert.deepEqual(extensionSettings.regex, []);
});

test('29. repair: save failure rolls back regex list and does not reload chat', async () => {
    const originalRegex = [
        createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'uuid-1', {
            disabled: true,
        }),
    ];
    const extensionSettings = { regex: originalRegex };
    let reloadCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                extensionSettings,
                uuidv4() {
                    return 'new-uuid';
                },
                saveSettingsDebounced() {
                    throw new Error('Save error');
                },
                async reloadCurrentChat() {
                    reloadCalls += 1;
                },
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'save-error');
    assert.strictEqual(extensionSettings.regex, originalRegex);
    assert.equal(reloadCalls, 0);
});

test('30. repair: active-chat reload is awaited once after successful save', async () => {
    const extensionSettings = { regex: [] };
    let reloadCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-active-1',
                extensionSettings,
                uuidv4() {
                    return 'new-uuid';
                },
                saveSettingsDebounced() {},
                async reloadCurrentChat() {
                    reloadCalls += 1;
                },
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'updated');
    assert.equal(reloadCalls, 1);
});

test('31. repair: no active chat skips reloadCurrentChat', async () => {
    for (const emptyChatId of [null, undefined, '', '   ', NaN]) {
        let reloadCalls = 0;
        const extensionSettings = { regex: [] };

        globalThis.SillyTavern = {
            getContext() {
                return {
                    chatId: emptyChatId,
                    extensionSettings,
                    uuidv4() {
                        return 'new-uuid';
                    },
                    saveSettingsDebounced() {},
                    async reloadCurrentChat() {
                        reloadCalls += 1;
                    },
                };
            },
        };

        const result = await repairRegexIntegration();

        assert.equal(result.status, 'updated');
        assert.equal(reloadCalls, 0);
    }
});

test('32. repair: reload failure preserves saved changes and returns updated-reload-failed', async () => {
    const extensionSettings = { regex: [] };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                extensionSettings,
                uuidv4() {
                    return 'new-uuid';
                },
                saveSettingsDebounced() {},
                async reloadCurrentChat() {
                    throw new Error('Reload failed');
                },
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'updated-reload-failed');
    assert.equal(result.inspection.status, REGEX_INTEGRATION_STATUS.CURRENT);
    assert.equal(extensionSettings.regex.length, 2);
});

test('33. repair: user customizations and unknown fields are preserved', async () => {
    const outdatedHygiene = createMockInstalledScript(
        MANAGED_REGEX_SCRIPTS[1],
        'custom-id-99',
        {
            disabled: true,
            userNote: 'keep me',
            customFlag: 12345,
        },
    );
    const extensionSettings = {
        regex: [
            createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'disp-1'),
            outdatedHygiene,
        ],
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                extensionSettings,
                uuidv4() {
                    return 'unexpected';
                },
                saveSettingsDebounced() {},
            };
        },
    };

    const result = await repairRegexIntegration();

    assert.equal(result.status, 'updated');
    const repairedHygiene = extensionSettings.regex[1];
    assert.equal(repairedHygiene.disabled, false);
    assert.equal(repairedHygiene.userNote, 'keep me');
    assert.equal(repairedHygiene.customFlag, 12345);
    assert.equal(repairedHygiene.id, 'custom-id-99');
});

test('34. inspectRegexIntegrationState never mutates deeply frozen inputs', () => {
    const deepFrozenSettings = Object.freeze({
        disabledExtensions: Object.freeze(['other-extension']),
        regex: Object.freeze([
            Object.freeze(
                createMockInstalledScript(MANAGED_REGEX_SCRIPTS[0], 'uuid-1', {
                    trimStrings: Object.freeze([]),
                    placement: Object.freeze([2]),
                }),
            ),
        ]),
    });

    assert.doesNotThrow(() => {
        const result = inspectRegexIntegrationState(deepFrozenSettings);
        assert.equal(result.status, REGEX_INTEGRATION_STATUS.NEEDS_REPAIR);
    });
});
