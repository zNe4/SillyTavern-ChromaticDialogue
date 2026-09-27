import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    clearAllLegacyMigrationUndos,
    getLegacyMigrationUndo,
    hasLegacyMigrationUndo,
    putLegacyMigrationUndo,
    removeLegacyMigrationUndo,
} from '../src/legacy-migration-undo-store.js';

function createValidSnapshot(overrides = {}) {
    return {
        chatId: 'chat-alpha',
        hadPreviousState: false,
        previousState: null,
        appliedState: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: '#112233' },
            },
        },
        messages: [
            {
                messageIndex: 0,
                before: 'Hello Alice',
                after: '[c1]Hello Alice[/c]',
            },
        ],
        ...overrides,
    };
}

test('valid snapshot stores and retrieves', () => {
    clearAllLegacyMigrationUndos();

    const snapshot = createValidSnapshot();
    const result = putLegacyMigrationUndo(snapshot);

    assert.equal(result.status, 'stored');
    assert.equal(result.snapshot.chatId, 'chat-alpha');
    assert.equal(hasLegacyMigrationUndo('chat-alpha'), true);

    const retrieved = getLegacyMigrationUndo('chat-alpha');
    assert.deepEqual(retrieved, snapshot);

    clearAllLegacyMigrationUndos();
});

test('stored/retrieved snapshot is deeply detached', () => {
    clearAllLegacyMigrationUndos();

    const original = createValidSnapshot({
        hadPreviousState: true,
        previousState: {
            schemaVersion: 1,
            assignments: {
                c2: { name: 'Bob', color: '#445566' },
            },
        },
    });

    const putRes = putLegacyMigrationUndo(original);
    assert.equal(putRes.status, 'stored');

    original.appliedState.assignments.c1.name = 'Mutated Alice';
    original.messages[0].before = 'Mutated Before';
    original.previousState.assignments.c2.name = 'Mutated Bob';

    const retrieved = getLegacyMigrationUndo('chat-alpha');
    assert.equal(retrieved.appliedState.assignments.c1.name, 'Alice');
    assert.equal(retrieved.messages[0].before, 'Hello Alice');
    assert.equal(retrieved.previousState.assignments.c2.name, 'Bob');

    retrieved.appliedState.assignments.c1.name = 'Mutated Read';
    retrieved.messages.push({ messageIndex: 1, before: 'a', after: 'b' });

    const retrievedSecond = getLegacyMigrationUndo('chat-alpha');
    assert.equal(retrievedSecond.appliedState.assignments.c1.name, 'Alice');
    assert.equal(retrievedSecond.messages.length, 1);

    clearAllLegacyMigrationUndos();
});

test('malformed/extra-key snapshot rejected without replacing valid stored data', () => {
    clearAllLegacyMigrationUndos();

    const valid = createValidSnapshot();
    assert.equal(putLegacyMigrationUndo(valid).status, 'stored');

    const extraKey = {
        ...createValidSnapshot(),
        extra: 'not allowed',
    };
    assert.deepEqual(putLegacyMigrationUndo(extraKey), {
        status: 'invalid-snapshot',
    });

    const missingKey = {
        chatId: 'chat-alpha',
        hadPreviousState: false,
        previousState: null,
        appliedState: valid.appliedState,
    };
    assert.deepEqual(putLegacyMigrationUndo(missingKey), {
        status: 'invalid-snapshot',
    });

    const notAnObject = null;
    assert.deepEqual(putLegacyMigrationUndo(notAnObject), {
        status: 'invalid-snapshot',
    });

    const retrieved = getLegacyMigrationUndo('chat-alpha');
    assert.deepEqual(retrieved, valid);

    clearAllLegacyMigrationUndos();
});

test('invalid chat IDs rejected', () => {
    clearAllLegacyMigrationUndos();

    const invalidIds = ['', '   ', ' chat-1', 'chat-1 ', null, undefined, 123, {}];

    for (const badId of invalidIds) {
        assert.deepEqual(
            putLegacyMigrationUndo(createValidSnapshot({ chatId: badId })),
            { status: 'invalid-snapshot' },
        );
        assert.equal(getLegacyMigrationUndo(badId), null);
        assert.equal(hasLegacyMigrationUndo(badId), false);
        assert.equal(removeLegacyMigrationUndo(badId), false);
    }
});

test('hadPreviousState=false requires previousState=null', () => {
    clearAllLegacyMigrationUndos();

    const badWhenFalse = createValidSnapshot({
        hadPreviousState: false,
        previousState: {
            schemaVersion: 1,
            assignments: {},
        },
    });
    assert.deepEqual(putLegacyMigrationUndo(badWhenFalse), {
        status: 'invalid-snapshot',
    });

    const goodWhenFalse = createValidSnapshot({
        hadPreviousState: false,
        previousState: null,
    });
    assert.equal(putLegacyMigrationUndo(goodWhenFalse).status, 'stored');

    clearAllLegacyMigrationUndos();
});

test('previous/applied states must satisfy strict CD state validation', () => {
    clearAllLegacyMigrationUndos();

    const badApplied = createValidSnapshot({
        appliedState: {
            schemaVersion: 1,
            assignments: {
                c1: { name: '', color: '#112233' },
            },
        },
    });
    assert.deepEqual(putLegacyMigrationUndo(badApplied), {
        status: 'invalid-snapshot',
    });

    const badPrevious = createValidSnapshot({
        hadPreviousState: true,
        previousState: {
            schemaVersion: 2,
            assignments: {},
        },
    });
    assert.deepEqual(putLegacyMigrationUndo(badPrevious), {
        status: 'invalid-snapshot',
    });

    const goodPrevious = createValidSnapshot({
        hadPreviousState: true,
        previousState: {
            schemaVersion: 1,
            assignments: {
                c2: { name: 'Bob', color: '#123456' },
            },
        },
    });
    assert.equal(putLegacyMigrationUndo(goodPrevious).status, 'stored');

    clearAllLegacyMigrationUndos();
});

test('message snapshots require unique ascending indexes and differing string before/after', () => {
    clearAllLegacyMigrationUndos();

    const emptyMessages = createValidSnapshot({ messages: [] });
    assert.deepEqual(putLegacyMigrationUndo(emptyMessages), {
        status: 'invalid-snapshot',
    });

    const descending = createValidSnapshot({
        messages: [
            { messageIndex: 2, before: 'b2', after: 'a2' },
            { messageIndex: 1, before: 'b1', after: 'a1' },
        ],
    });
    assert.deepEqual(putLegacyMigrationUndo(descending), {
        status: 'invalid-snapshot',
    });

    const duplicate = createValidSnapshot({
        messages: [
            { messageIndex: 1, before: 'b1', after: 'a1' },
            { messageIndex: 1, before: 'b2', after: 'a2' },
        ],
    });
    assert.deepEqual(putLegacyMigrationUndo(duplicate), {
        status: 'invalid-snapshot',
    });

    const negative = createValidSnapshot({
        messages: [{ messageIndex: -1, before: 'b', after: 'a' }],
    });
    assert.deepEqual(putLegacyMigrationUndo(negative), {
        status: 'invalid-snapshot',
    });

    const identicalBeforeAfter = createValidSnapshot({
        messages: [{ messageIndex: 0, before: 'same', after: 'same' }],
    });
    assert.deepEqual(putLegacyMigrationUndo(identicalBeforeAfter), {
        status: 'invalid-snapshot',
    });

    const extraMessageKey = createValidSnapshot({
        messages: [
            { messageIndex: 0, before: 'b', after: 'a', role: 'assistant' },
        ],
    });
    assert.deepEqual(putLegacyMigrationUndo(extraMessageKey), {
        status: 'invalid-snapshot',
    });

    clearAllLegacyMigrationUndos();
});

test('same-chat put replaces previous snapshot; different chats remain independent', () => {
    clearAllLegacyMigrationUndos();

    const first = createValidSnapshot({
        chatId: 'chat-alpha',
        messages: [{ messageIndex: 0, before: 'first-b', after: 'first-a' }],
    });
    assert.equal(putLegacyMigrationUndo(first).status, 'stored');

    const second = createValidSnapshot({
        chatId: 'chat-alpha',
        messages: [{ messageIndex: 1, before: 'second-b', after: 'second-a' }],
    });
    assert.equal(putLegacyMigrationUndo(second).status, 'stored');

    const retrievedAlpha = getLegacyMigrationUndo('chat-alpha');
    assert.equal(retrievedAlpha.messages[0].messageIndex, 1);
    assert.equal(retrievedAlpha.messages[0].before, 'second-b');

    const beta = createValidSnapshot({
        chatId: 'chat-beta',
        messages: [{ messageIndex: 0, before: 'beta-b', after: 'beta-a' }],
    });
    assert.equal(putLegacyMigrationUndo(beta).status, 'stored');

    assert.equal(hasLegacyMigrationUndo('chat-alpha'), true);
    assert.equal(hasLegacyMigrationUndo('chat-beta'), true);
    assert.equal(getLegacyMigrationUndo('chat-beta').messages[0].before, 'beta-b');

    clearAllLegacyMigrationUndos();
});

test('has/remove semantics are exact and invalid IDs are harmless', () => {
    clearAllLegacyMigrationUndos();

    assert.equal(hasLegacyMigrationUndo('chat-alpha'), false);
    assert.equal(removeLegacyMigrationUndo('chat-alpha'), false);

    const snapshot = createValidSnapshot({ chatId: 'chat-alpha' });
    putLegacyMigrationUndo(snapshot);

    assert.equal(hasLegacyMigrationUndo('chat-alpha'), true);
    assert.equal(removeLegacyMigrationUndo('chat-alpha'), true);
    assert.equal(hasLegacyMigrationUndo('chat-alpha'), false);
    assert.equal(removeLegacyMigrationUndo('chat-alpha'), false);

    assert.equal(hasLegacyMigrationUndo(''), false);
    assert.equal(removeLegacyMigrationUndo(''), false);

    clearAllLegacyMigrationUndos();
});

test('clearAll removes every snapshot and returned mutation never affects later reads', () => {
    clearAllLegacyMigrationUndos();

    putLegacyMigrationUndo(createValidSnapshot({ chatId: 'chat-1' }));
    putLegacyMigrationUndo(createValidSnapshot({ chatId: 'chat-2' }));

    assert.equal(hasLegacyMigrationUndo('chat-1'), true);
    assert.equal(hasLegacyMigrationUndo('chat-2'), true);

    clearAllLegacyMigrationUndos();

    assert.equal(hasLegacyMigrationUndo('chat-1'), false);
    assert.equal(hasLegacyMigrationUndo('chat-2'), false);
    assert.equal(getLegacyMigrationUndo('chat-1'), null);
    assert.equal(getLegacyMigrationUndo('chat-2'), null);
});