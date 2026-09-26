import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DIALOGUE_TONES,
    isSupportedDialogueTone,
    hasDialogueMarkerForId,
} from '../src/dialogue-syntax.js';

test('1. exact canonical vocabulary order and immutability', () => {
    assert.deepEqual(DIALOGUE_TONES, [
        'whisper',
        'shout',
        'measured',
        'tremble',
    ]);

    assert.equal(Object.isFrozen(DIALOGUE_TONES), true);

    assert.throws(() => {
        DIALOGUE_TONES.push('fake');
    }, TypeError);

    assert.throws(() => {
        DIALOGUE_TONES[0] = 'fake';
    }, TypeError);
});

test('2. supported-tone recognition for all four lowercase tokens', () => {
    assert.equal(isSupportedDialogueTone('whisper'), true);
    assert.equal(isSupportedDialogueTone('shout'), true);
    assert.equal(isSupportedDialogueTone('measured'), true);
    assert.equal(isSupportedDialogueTone('tremble'), true);
});

test('3. unsupported tone values rejected', () => {
    const invalidValues = [
        'Whisper',
        'WHISPER',
        ' whisper ',
        'normal',
        'cry',
        'playful',
        'staccato',
        '',
        null,
        undefined,
        42,
        {},
        [],
        true,
    ];

    for (const value of invalidValues) {
        assert.equal(
            isSupportedDialogueTone(value),
            false,
            `Expected ${String(value)} to be rejected`,
        );
    }
});

test('4. ordinary dialogue markers recognized for c1 and c99', () => {
    assert.equal(hasDialogueMarkerForId('[c1] Speaking.', 'c1'), true);
    assert.equal(hasDialogueMarkerForId('[c99] Speaking.', 'c99'), true);
    assert.equal(hasDialogueMarkerForId('No markers here.', 'c1'), false);
});

test('5. all four toned markers recognized for canonical ID', () => {
    assert.equal(hasDialogueMarkerForId('[c3:whisper] Quiet speech.[/c]', 'c3'), true);
    assert.equal(hasDialogueMarkerForId('[c3:shout] Loud speech.[/c]', 'c3'), true);
    assert.equal(hasDialogueMarkerForId('[c3:measured] Careful speech.[/c]', 'c3'), true);
    assert.equal(hasDialogueMarkerForId('[c3:tremble] Shaky speech.[/c]', 'c3'), true);
});

test('6. unsupported and malformed tone markers rejected', () => {
    const malformedMarkers = [
        '[c3:normal]Dialogue.[/c]',
        '[c3:cry]Dialogue.[/c]',
        '[c3:playful]Dialogue.[/c]',
        '[c3:staccato]Dialogue.[/c]',
        '[c3:Whisper]Dialogue.[/c]',
        '[c3: whisper]Dialogue.[/c]',
        '[c3:whisper ]Dialogue.[/c]',
        '[c3:whisper:soft]Dialogue.[/c]',
    ];

    for (const marker of malformedMarkers) {
        assert.equal(
            hasDialogueMarkerForId(marker, 'c3'),
            false,
            `Expected marker ${marker} to be rejected`,
        );
    }
});

test('7. exact ID matching prevents prefix collisions', () => {
    const c10Message = '[c10]Speaking.[/c] [c10:whisper]Whispering.[/c]';
    assert.equal(hasDialogueMarkerForId(c10Message, 'c1'), false);

    const c1Message = '[c1]Speaking.[/c] [c1:whisper]Whispering.[/c]';
    assert.equal(hasDialogueMarkerForId(c1Message, 'c10'), false);
});

test('8. invalid inputs return false without throwing', () => {
    const invalidMessages = [null, undefined, 42, {}, [], true, Symbol('msg')];
    for (const msg of invalidMessages) {
        assert.equal(hasDialogueMarkerForId(msg, 'c1'), false);
    }

    const invalidIds = ['c0', 'c100', 'C1', ' c1 ', '1', null, undefined, 42, {}, []];
    for (const id of invalidIds) {
        assert.equal(hasDialogueMarkerForId('[c1] Speaking.', id), false);
    }
});

test('9. opening-marker-only semantics recognized without closing tag', () => {
    assert.equal(
        hasDialogueMarkerForId('[c3:whisper] No closing tag in sight', 'c3'),
        true,
    );
    assert.equal(
        hasDialogueMarkerForId('[c3] Ordinary marker without closing tag', 'c3'),
        true,
    );
});