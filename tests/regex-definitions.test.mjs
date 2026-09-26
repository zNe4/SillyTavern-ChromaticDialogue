import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    MANAGED_FIELDS,
    MANAGED_REGEX_SCRIPTS,
} from '../src/regex-definitions.js';

const dialogueJson = JSON.parse(
    fs.readFileSync(
        new URL('../docs/regex-dialogue-display.json', import.meta.url),
        'utf8',
    ),
);

const controlJson = JSON.parse(
    fs.readFileSync(
        new URL('../docs/regex-control-records.json', import.meta.url),
        'utf8',
    ),
);

test('1. exactly two canonical definitions exist', () => {
    assert.equal(MANAGED_REGEX_SCRIPTS.length, 2);
});

test('2. order is dialogue-display then prompt-hygiene', () => {
    assert.equal(MANAGED_REGEX_SCRIPTS[0].key, 'dialogue-display');
    assert.equal(MANAGED_REGEX_SCRIPTS[1].key, 'prompt-hygiene');
});

test('3. keys are exact and unique', () => {
    const keys = MANAGED_REGEX_SCRIPTS.map((script) => script.key);
    assert.deepEqual(keys, ['dialogue-display', 'prompt-hygiene']);
    assert.equal(new Set(keys).size, 2);
});

test('4. script names are exact and unique', () => {
    const names = MANAGED_REGEX_SCRIPTS.map((script) => script.scriptName);
    assert.deepEqual(names, [
        'Chromatic Dialogue - Dialogue display',
        'Chromatic Dialogue - Hide control records from prompt',
    ]);
    assert.equal(new Set(names).size, 2);
});

test('5. definitions and nested arrays are immutable', () => {
    assert.ok(Object.isFrozen(MANAGED_REGEX_SCRIPTS));

    for (const definition of MANAGED_REGEX_SCRIPTS) {
        assert.ok(Object.isFrozen(definition));
        assert.ok(Object.isFrozen(definition.trimStrings));
        assert.ok(Object.isFrozen(definition.placement));

        assert.throws(() => {
            definition.scriptName = 'Tampered name';
        }, TypeError);

        assert.throws(() => {
            definition.trimStrings.push('tampered');
        }, TypeError);

        assert.throws(() => {
            definition.placement.push(99);
        }, TypeError);
    }
});

test("6. dialogue definition exactly matches the supplied JSON asset's managed fields", () => {
    const dialogueDef = MANAGED_REGEX_SCRIPTS[0];

    for (const field of MANAGED_FIELDS) {
        assert.deepEqual(
            dialogueDef[field],
            dialogueJson[field],
            `Managed field "${field}" must match JSON asset`,
        );
    }
});

test("7. prompt-hygiene definition exactly matches its supplied JSON asset's managed fields", () => {
    const controlDef = MANAGED_REGEX_SCRIPTS[1];

    for (const field of MANAGED_FIELDS) {
        assert.deepEqual(
            controlDef[field],
            controlJson[field],
            `Managed field "${field}" must match JSON asset`,
        );
    }
});

test('8. the JSON asset id fields are intentionally NOT required to equal runtime installed IDs', () => {
    assert.equal(typeof dialogueJson.id, 'string');
    assert.equal(typeof controlJson.id, 'string');

    assert.equal(MANAGED_REGEX_SCRIPTS[0].id, undefined);
    assert.equal(MANAGED_REGEX_SCRIPTS[1].id, undefined);
});

test('9. no unexpected managed definition fields leak into the SillyTavern script payload contract', () => {
    const allowedDefinitionKeys = new Set(['key', ...MANAGED_FIELDS]);

    for (const definition of MANAGED_REGEX_SCRIPTS) {
        const actualKeys = Object.keys(definition);
        for (const key of actualKeys) {
            assert.ok(
                allowedDefinitionKeys.has(key),
                `Unexpected key "${key}" found in definition`,
            );
        }
        assert.equal(actualKeys.length, allowedDefinitionKeys.size);
    }
});