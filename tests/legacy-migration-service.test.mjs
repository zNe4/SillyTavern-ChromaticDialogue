import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLegacyChatInventory } from '../src/legacy-chat-inventory.js';
import { planLegacyMigration } from '../src/legacy-migration-planner.js';
import { createEmptyState } from '../src/domain.js';
import { CHAT_METADATA_KEY } from '../src/constants.js';
import {
    applyLegacyMigration,
    undoLastLegacyMigration,
} from '../src/legacy-migration-service.js';
import {
    clearAllLegacyMigrationUndos,
    getLegacyMigrationUndo,
    hasLegacyMigrationUndo,
} from '../src/legacy-migration-undo-store.js';

function getFixtureMessage(type = 'ff-normal') {
    let candidates;
    if (type === 'ff-tone') {
        candidates = [
            '<#E06666:whisper>Hello world</#E06666>',
            '<#E06666:whisper>Hello world</#E06666:whisper>',
            '<font color="#E06666" data-tone="whisper">Hello world</font>',
            '<font color="#E06666" tone="whisper">Hello world</font>',
            '<span style="color: #E06666" data-tone="whisper">Hello world</span>',
            '<span style="color: #E06666" tone="whisper">Hello world</span>',
            '<span style="color: #E06666; --tone: whisper">Hello world</span>',
            '<#E06666:whisper>"Hello world"</#E06666>',
            '<font color="#E06666:whisper">Hello world</font>',
        ];
    } else if (type === 'nemo') {
        candidates = [
            '"<span style="color: #E06666">Hello world</span>"',
            '"<span style="color:#E06666">Hello world</span>"',
            '"<font color="#E06666">Hello world</font>"',
            '“<span style="color: #E06666">Hello world</span>”',
        ];
    } else {
        candidates = [
            '<#E06666>Hello world</#E06666>',
            '<span style="color: #E06666">"Hello world"</span>',
            '<span style="color: #E06666">Hello world</span>',
            '<font color="#E06666">"Hello world"</font>',
            '<font color="#E06666">Hello world</font>',
        ];
    }

    for (const c of candidates) {
        try {
            const inv = buildLegacyChatInventory(
                [{ mes: c, is_user: false }],
                createEmptyState(),
                { includeIntroduction: true },
            );
            if (inv.occurrences?.length > 0) {
                if (type === 'ff-tone' && inv.occurrences[0].tone === null) {
                    continue;
                }
                return c;
            }
        } catch {
            // try next candidate
        }
    }

    return candidates[0];
}

function setupContext(overrides = {}) {
    const defaultChat = [
        {
            mes: getFixtureMessage('ff-normal'),
            is_user: false,
        },
    ];

    const ctx = {
        chatId: 'chat-42',
        chat: defaultChat,
        chatMetadata: {},
        saveChatCalls: 0,
        reloadCalls: 0,
        saveChat: async function () {
            this.saveChatCalls += 1;
        },
        reloadCurrentChat: async function () {
            this.reloadCalls += 1;
        },
        ...overrides,
    };

    globalThis.SillyTavern = {
        getContext: () => ctx,
    };

    return ctx;
}

function createPlanFixture(chat, state = createEmptyState(), name = 'Alice', color = '#E06666') {
    const inventory = buildLegacyChatInventory(chat, state, {
        includeIntroduction: true,
    });
    const mappings = inventory.groups
        .filter((g) => g.migratableCount > 0)
        .map((g, idx) => ({
            sourceKey: g.sourceKey,
            action: 'create',
            name: `${name} ${idx + 1}`,
            color,
        }));
    const preview = planLegacyMigration(chat, state, inventory, mappings);

    return { inventory, mappings, preview };
}

function cleanup() {
    delete globalThis.SillyTavern;
    clearAllLegacyMigrationUndos();
}

test('1. invalid expectedChatId -> invalid-request', async () => {
    setupContext();
    const badIds = ['', '   ', ' chat-1', 'chat-1 ', null, undefined, 42];

    for (const badId of badIds) {
        const result = await applyLegacyMigration(badId, {}, [], {});
        assert.deepEqual(result, { status: 'invalid-request' });
    }
    cleanup();
});

test('2. missing SillyTavern/getContext -> no-chat', async () => {
    delete globalThis.SillyTavern;
    const result = await applyLegacyMigration('chat-42', {}, [], {});
    assert.deepEqual(result, { status: 'no-chat' });
    cleanup();
});

test('3. active chat mismatch -> chat-changed', async () => {
    setupContext({ chatId: 'chat-other' });
    const result = await applyLegacyMigration('chat-42', {}, [], {});
    assert.deepEqual(result, { status: 'chat-changed' });
    cleanup();
});

test('4. malformed chat array -> invalid-context', async () => {
    setupContext({ chat: 'not-an-array' });
    const result = await applyLegacyMigration('chat-42', {}, [], {});
    assert.deepEqual(result, { status: 'invalid-context' });
    cleanup();
});

test('5. malformed chatMetadata -> invalid-context', async () => {
    setupContext({ chatMetadata: null });
    const result = await applyLegacyMigration('chat-42', {}, [], {});
    assert.deepEqual(result, { status: 'invalid-context' });
    cleanup();
});

test('6. missing saveChat function -> invalid-context', async () => {
    setupContext({ saveChat: null });
    const result = await applyLegacyMigration('chat-42', {}, [], {});
    assert.deepEqual(result, { status: 'invalid-context' });
    cleanup();
});

test('7. absent CD metadata is treated as an empty strict state and can migrate', async () => {
    const ctx = setupContext();
    delete ctx.chatMetadata[CHAT_METADATA_KEY];

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    assert.equal(preview.status, 'ready');

    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied');
    assert.ok(ctx.chatMetadata[CHAT_METADATA_KEY]);
    assert.equal(ctx.chatMetadata[CHAT_METADATA_KEY].schemaVersion, 1);
    assert.equal(ctx.saveChatCalls, 1);
    cleanup();
});

test('8. existing malformed CD metadata -> invalid-state', async () => {
    setupContext({
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: { c1: { name: '', color: 'bad' } },
            },
        },
    });

    const result = await applyLegacyMigration('chat-42', {}, [], {
        status: 'ready',
    });
    assert.deepEqual(result, { status: 'invalid-state' });
    cleanup();
});

test('9. invalid/non-ready approvedPreview -> invalid-preview', async () => {
    const ctx = setupContext();
    const badPreviews = [
        null,
        undefined,
        [],
        { status: 'invalid-mappings' },
        { status: 'stale-inventory' },
    ];

    for (const badPreview of badPreviews) {
        const result = await applyLegacyMigration(
            'chat-42',
            {},
            [],
            badPreview,
        );
        assert.deepEqual(result, { status: 'invalid-preview' });
    }
    assert.equal(ctx.saveChatCalls, 0);
    cleanup();
});

test('10. fresh planner rejection is returned as plan-rejected without mutation', async () => {
    const ctx = setupContext();
    const initialText = ctx.chat[0].mes;

    const result = await applyLegacyMigration('chat-42', {}, [], {
        status: 'ready',
    });

    assert.equal(result.status, 'plan-rejected');
    assert.ok(Array.isArray(result.errors));
    assert.equal(ctx.chat[0].mes, initialText);
    assert.equal(ctx.saveChatCalls, 0);
    cleanup();
});

test('11. changed legacy dialogue after preview -> stale-preview', async () => {
    const ctx = setupContext();
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);

    ctx.chat[0].mes = `${ctx.chat[0].mes} added text`;

    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'stale-preview');
    assert.equal(ctx.saveChatCalls, 0);
    cleanup();
});

test('12. changed existing assignment after preview -> stale-inventory rejected by planner', async () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
        },
    };
    const ctx = setupContext({
        chatMetadata: {
            [CHAT_METADATA_KEY]: state,
        },
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat, state);

    ctx.chatMetadata[CHAT_METADATA_KEY] = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice Mutated', color: '#998877' },
        },
    };

    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'plan-rejected');
    assert.equal(result.planStatus, 'stale-inventory');
    assert.equal(ctx.saveChatCalls, 0);
    cleanup();
});

test('13. raw text change inside a message covered by the approved preview -> stale-inventory rejected by planner', async () => {
    const ctx = setupContext();
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);

    ctx.chat[0].mes = 'Entirely new message text';

    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'plan-rejected');
    assert.equal(result.planStatus, 'stale-inventory');
    assert.equal(ctx.saveChatCalls, 0);
    cleanup();
});

test('14. unchanged approved preview proceeds successfully', async () => {
    const ctx = setupContext();
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);

    const invBefore = JSON.stringify(inventory);
    const mapBefore = JSON.stringify(mappings);
    const prevBefore = JSON.stringify(preview);

    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied');
    assert.equal(result.undoAvailable, true);
    assert.equal(JSON.stringify(inventory), invBefore);
    assert.equal(JSON.stringify(mappings), mapBefore);
    assert.equal(JSON.stringify(preview), prevBefore);
    cleanup();
});

test('15. no-op ready plan performs no save/reload and does not replace an older undo snapshot', async () => {
    const ctx = setupContext({
        chat: [{ mes: 'Standard plain text without legacy markup', is_user: false }],
    });

    const existingUndo = {
        chatId: 'chat-42',
        hadPreviousState: false,
        previousState: null,
        appliedState: createEmptyState(),
        messages: [{ messageIndex: 0, before: 'prev-b', after: 'prev-a' }],
    };
    const { putLegacyMigrationUndo } = await import(
        '../src/legacy-migration-undo-store.js'
    );
    putLegacyMigrationUndo(existingUndo);

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);

    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'no-op');
    assert.equal(ctx.saveChatCalls, 0);
    assert.equal(ctx.reloadCalls, 0);

    const undo = getLegacyMigrationUndo('chat-42');
    assert.equal(undo.messages[0].before, 'prev-b');
    cleanup();
});

test('16. one-message migration rewrites exact .mes, writes planned CD state, and calls saveChat exactly once', async () => {
    const ctx = setupContext({
        chat: [{ mes: getFixtureMessage('nemo'), is_user: false }],
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    assert.equal(preview.messageChanges.length, 1);

    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied');
    assert.equal(ctx.chat[0].mes, preview.messageChanges[0].after);
    assert.ok(ctx.chat[0].mes.startsWith('[c1]'));
    assert.ok(!ctx.chat[0].mes.startsWith('"'));
    assert.equal(ctx.saveChatCalls, 1);
    assert.equal(Boolean(ctx.chatMetadata.CD_NEW), false);
    cleanup();
});

test('17. multiple changed messages are applied together before one save', async () => {
    const ctx = setupContext({
        chat: [
            { mes: getFixtureMessage('ff-tone'), is_user: false },
            { mes: getFixtureMessage('ff-normal'), is_user: false },
        ],
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied');
    assert.equal(ctx.saveChatCalls, 1);
    for (const change of preview.messageChanges) {
        assert.equal(ctx.chat[change.messageIndex].mes, change.after);
    }
    cleanup();
});

test('18. unrelated messages, message fields, metadata keys and swipes are preserved', async () => {
    const ctx = setupContext({
        chat: [
            {
                mes: getFixtureMessage('ff-normal'),
                is_user: false,
                swipes: ['swipe 1', 'swipe 2'],
                extra: { preserved: 123 },
            },
            {
                mes: 'Unrelated user message',
                is_user: true,
            },
        ],
        chatMetadata: {
            custom_unrelated_key: 'preserve-me',
        },
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied');
    assert.equal(ctx.chat[0].swipes.length, 2);
    assert.equal(ctx.chat[0].extra.preserved, 123);
    assert.equal(ctx.chat[1].mes, 'Unrelated user message');
    assert.equal(ctx.chatMetadata.custom_unrelated_key, 'preserve-me');
    cleanup();
});

test('19. migration uses one chat-save boundary and never calls a separate metadata-save path', async () => {
    let metadataSaveCalled = false;
    const ctx = setupContext({
        saveMetadata: async () => {
            metadataSaveCalled = true;
        },
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied');
    assert.equal(ctx.saveChatCalls, 1);
    assert.equal(metadataSaveCalled, false);
    cleanup();
});

test('20. successful migration creates a detached undo snapshot', async () => {
    const ctx = setupContext();
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);

    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied');
    assert.equal(hasLegacyMigrationUndo('chat-42'), true);

    const snapshot = getLegacyMigrationUndo('chat-42');
    assert.equal(snapshot.chatId, 'chat-42');
    assert.equal(snapshot.messages.length, preview.messageChanges.length);
    assert.equal(snapshot.messages[0].before, preview.messageChanges[0].before);
    assert.equal(snapshot.messages[0].after, preview.messageChanges[0].after);
    assert.equal(Boolean(ctx.chatMetadata.undo), false);
    cleanup();
});

test('21. migration from a chat with NO previous CD state records hadPreviousState=false', async () => {
    const ctx = setupContext();
    delete ctx.chatMetadata[CHAT_METADATA_KEY];

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    await applyLegacyMigration('chat-42', inventory, mappings, preview);

    const snapshot = getLegacyMigrationUndo('chat-42');
    assert.equal(snapshot.hadPreviousState, false);
    assert.equal(snapshot.previousState, null);
    cleanup();
});

test('22. migration with existing assignments records/restores canonical previousState', async () => {
    const existing = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'ExistingAlice', color: '#112233' },
        },
    };
    const ctx = setupContext({
        chatMetadata: {
            [CHAT_METADATA_KEY]: existing,
        },
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat, existing);
    await applyLegacyMigration('chat-42', inventory, mappings, preview);

    const snapshot = getLegacyMigrationUndo('chat-42');
    assert.equal(snapshot.hadPreviousState, true);
    assert.deepEqual(snapshot.previousState, existing);
    assert.equal(
        ctx.chatMetadata[CHAT_METADATA_KEY].assignments.c1.name,
        'ExistingAlice',
    );
    cleanup();
});

test('23. normal success reloads current chat exactly once when reload API exists', async () => {
    const ctx = setupContext();
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);

    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied');
    assert.equal(ctx.reloadCalls, 1);
    cleanup();
});

test('24. successful migration without reloadCurrentChat still returns applied', async () => {
    const ctx = setupContext({ reloadCurrentChat: undefined });
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);

    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied');
    assert.equal(result.undoAvailable, true);
    cleanup();
});

test('25. a later successful migration in the same chat replaces the previous undo snapshot', async () => {
    const ctx = setupContext();
    const fixture1 = createPlanFixture(ctx.chat, createEmptyState(), 'FirstRun');
    await applyLegacyMigration('chat-42', fixture1.inventory, fixture1.mappings, fixture1.preview);

    const snap1 = getLegacyMigrationUndo('chat-42');
    assert.equal(snap1.messages[0].before, fixture1.preview.messageChanges[0].before);

    ctx.chat.push({
        mes: getFixtureMessage('ff-normal'),
        is_user: false,
    });
    const stateAfter1 = ctx.chatMetadata[CHAT_METADATA_KEY];
    const fixture2 = createPlanFixture(ctx.chat, stateAfter1, 'SecondRun');

    await applyLegacyMigration('chat-42', fixture2.inventory, fixture2.mappings, fixture2.preview);

    const snap2 = getLegacyMigrationUndo('chat-42');
    assert.notDeepEqual(snap2, snap1);
    assert.equal(snap2.hadPreviousState, true);
    cleanup();
});

test('26. saveChat rejection rolls every owned message/state mutation back and returns save-error', async () => {
    const ctx = setupContext({
        saveChat: async () => {
            throw new Error('Disk write failure');
        },
    });

    const initialText = ctx.chat[0].mes;
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);

    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'save-error');
    assert.equal(result.rollbackComplete, true);
    assert.equal(ctx.chat[0].mes, initialText);
    assert.equal(
        Object.prototype.hasOwnProperty.call(ctx.chatMetadata, CHAT_METADATA_KEY),
        false,
    );
    cleanup();
});

test('27. save failure with a concurrently changed migrated message preserves that newer value and reports rollback incomplete', async () => {
    const ctx = setupContext({
        saveChat: async function () {
            ctx.chat[0].mes = 'Concurrently written newer value';
            throw new Error('Save failed');
        },
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'save-error-rollback-incomplete');
    assert.equal(result.rollbackComplete, false);
    assert.equal(ctx.chat[0].mes, 'Concurrently written newer value');
    cleanup();
});

test('28. failed apply creates no undo snapshot and never reloads', async () => {
    const ctx = setupContext({
        saveChat: async () => {
            throw new Error('Save failure');
        },
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    await applyLegacyMigration('chat-42', inventory, mappings, preview);

    assert.equal(hasLegacyMigrationUndo('chat-42'), false);
    assert.equal(ctx.reloadCalls, 0);
    cleanup();
});

test('29. reload failure after successful save returns applied-reload-failed and keeps undo available', async () => {
    setupContext({
        reloadCurrentChat: async () => {
            throw new Error('DOM render glitch');
        },
    });

    const { inventory, mappings, preview } = createPlanFixture(globalThis.SillyTavern.getContext().chat);
    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied-reload-failed');
    assert.equal(result.undoAvailable, true);
    assert.equal(hasLegacyMigrationUndo('chat-42'), true);
    cleanup();
});

test('30. chat switch after successful save returns applied-chat-changed, does not reload the new chat, and keeps original-chat undo', async () => {
    const ctx = setupContext({
        saveChat: async function () {
            this.chatId = 'chat-switched';
        },
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied-chat-changed');
    assert.equal(result.undoAvailable, true);
    assert.equal(ctx.reloadCalls, 0);
    assert.equal(hasLegacyMigrationUndo('chat-42'), true);
    cleanup();
});

test('31. concurrent same-chat edit after successful save returns applied-concurrent-change and does not reload', async () => {
    const ctx = setupContext({
        saveChat: async function () {
            this.chat[0].mes = 'New edit during save';
        },
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    const result = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );

    assert.equal(result.status, 'applied-concurrent-change');
    assert.equal(result.undoAvailable, true);
    assert.equal(ctx.reloadCalls, 0);

    cleanup();

    let postSaveInspectionFailed = false;
    let throwingContext;
    const initialMsg = getFixtureMessage('ff-normal');
    const liveChat = [{ mes: initialMsg, is_user: false }];
    const liveMetadata = {};

    throwingContext = {
        chatId: 'chat-42',
        get chat() {
            if (postSaveInspectionFailed) {
                throw new Error('post-save inspection failure');
            }
            return liveChat;
        },
        chatMetadata: liveMetadata,
        saveChatCalls: 0,
        reloadCalls: 0,
        saveChat: async function () {
            this.saveChatCalls += 1;
            postSaveInspectionFailed = true;
        },
        reloadCurrentChat: async function () {
            this.reloadCalls += 1;
        },
    };

    globalThis.SillyTavern = {
        getContext: () => throwingContext,
    };

    const fixtureThrow = createPlanFixture(liveChat);
    const expectedAppliedMes = fixtureThrow.preview.messageChanges[0].after;

    const throwResult = await applyLegacyMigration(
        'chat-42',
        fixtureThrow.inventory,
        fixtureThrow.mappings,
        fixtureThrow.preview,
    );

    assert.equal(throwResult.status, 'applied-concurrent-change');
    assert.equal(throwResult.undoAvailable, true);
    assert.notEqual(throwResult.status, 'save-error');
    assert.notEqual(throwResult.status, 'save-error-rollback-incomplete');
    assert.equal(throwingContext.saveChatCalls, 1);
    assert.equal(liveChat[0].mes, expectedAppliedMes);
    assert.ok(liveMetadata[CHAT_METADATA_KEY]);
    assert.equal(hasLegacyMigrationUndo('chat-42'), true);

    cleanup();
});

test('32. overlapping apply/undo attempt while save is pending returns busy rather than queueing another destructive action', async () => {
    let unblockSave;
    const savePromise = new Promise((resolve) => {
        unblockSave = resolve;
    });

    setupContext({
        saveChat: async () => {
            await savePromise;
        },
    });

    const ctx = globalThis.SillyTavern.getContext();
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);

    const firstOp = applyLegacyMigration('chat-42', inventory, mappings, preview);

    const concurrentApply = await applyLegacyMigration(
        'chat-42',
        inventory,
        mappings,
        preview,
    );
    assert.deepEqual(concurrentApply, { status: 'busy' });

    const concurrentUndo = await undoLastLegacyMigration('chat-42');
    assert.deepEqual(concurrentUndo, { status: 'busy' });

    unblockSave();
    const firstResult = await firstOp;
    assert.equal(firstResult.status, 'applied');
    cleanup();
});

test('33. undo after migration restores all migrated messages and deletes CD metadata when none existed before', async () => {
    const ctx = setupContext();
    const originalText = ctx.chat[0].mes;
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);

    await applyLegacyMigration('chat-42', inventory, mappings, preview);
    assert.notEqual(ctx.chat[0].mes, originalText);

    const undoResult = await undoLastLegacyMigration('chat-42');
    assert.equal(undoResult.status, 'undone');
    assert.equal(ctx.chat[0].mes, originalText);
    assert.equal(
        Object.prototype.hasOwnProperty.call(ctx.chatMetadata, CHAT_METADATA_KEY),
        false,
    );
    assert.equal(ctx.saveChatCalls, 2);
    cleanup();
});

test('34. undo restores the previous existing CD state when one existed', async () => {
    const existing = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'PreviousAlice', color: '#556677' },
        },
    };
    const ctx = setupContext({
        chatMetadata: {
            [CHAT_METADATA_KEY]: existing,
        },
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat, existing);
    await applyLegacyMigration('chat-42', inventory, mappings, preview);

    const undoResult = await undoLastLegacyMigration('chat-42');
    assert.equal(undoResult.status, 'undone');
    assert.deepEqual(ctx.chatMetadata[CHAT_METADATA_KEY], existing);
    cleanup();
});

test('35. no stored snapshot -> no-undo', async () => {
    setupContext();
    const result = await undoLastLegacyMigration('chat-42');
    assert.deepEqual(result, { status: 'no-undo' });
    cleanup();
});

test('36. changed migrated message -> stale-undo; no save and snapshot remains', async () => {
    const ctx = setupContext();
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    await applyLegacyMigration('chat-42', inventory, mappings, preview);

    ctx.chat[0].mes = 'User manually altered this message';

    const undoResult = await undoLastLegacyMigration('chat-42');
    assert.equal(undoResult.status, 'stale-undo');
    assert.equal(hasLegacyMigrationUndo('chat-42'), true);
    assert.equal(ctx.saveChatCalls, 1);
    cleanup();
});

test('37. changed CD assignment state -> stale-undo; no save and snapshot remains', async () => {
    const ctx = setupContext();
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    await applyLegacyMigration('chat-42', inventory, mappings, preview);

    ctx.chatMetadata[CHAT_METADATA_KEY].assignments.c1.name = 'ChangedName';

    const undoResult = await undoLastLegacyMigration('chat-42');
    assert.equal(undoResult.status, 'stale-undo');
    assert.equal(hasLegacyMigrationUndo('chat-42'), true);
    assert.equal(ctx.saveChatCalls, 1);
    cleanup();
});

test('38. undo save rejection safely restores applied values and retains the undo snapshot', async () => {
    const ctx = setupContext();
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    await applyLegacyMigration('chat-42', inventory, mappings, preview);

    const appliedText = ctx.chat[0].mes;
    ctx.saveChat = async () => {
        throw new Error('Undo save failed');
    };

    const undoResult = await undoLastLegacyMigration('chat-42');
    assert.equal(undoResult.status, 'save-error');
    assert.equal(undoResult.rollbackComplete, true);
    assert.equal(ctx.chat[0].mes, appliedText);
    assert.equal(hasLegacyMigrationUndo('chat-42'), true);
    cleanup();
});

test('39. successful undo preserves unrelated changed/appended messages, consumes snapshot, and second undo returns no-undo', async () => {
    const ctx = setupContext();
    const originalText = ctx.chat[0].mes;
    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);

    await applyLegacyMigration('chat-42', inventory, mappings, preview);

    ctx.chat.push({ mes: 'New unrelated dialogue message', is_user: false });

    const undoResult = await undoLastLegacyMigration('chat-42');
    assert.equal(undoResult.status, 'undone');
    assert.equal(ctx.chat[0].mes, originalText);
    assert.equal(ctx.chat[1].mes, 'New unrelated dialogue message');
    assert.equal(hasLegacyMigrationUndo('chat-42'), false);

    const secondUndo = await undoLastLegacyMigration('chat-42');
    assert.deepEqual(secondUndo, { status: 'no-undo' });
    cleanup();
});

test('40. undo reload failure/chat switch/concurrent-change post-save paths do not undo the successful persisted restore and do not leave the consumed snapshot available', async () => {
    const ctx = setupContext({
        reloadCurrentChat: async () => {
            throw new Error('Reload fail');
        },
    });

    const { inventory, mappings, preview } = createPlanFixture(ctx.chat);
    await applyLegacyMigration('chat-42', inventory, mappings, preview);

    const result = await undoLastLegacyMigration('chat-42');
    assert.equal(result.status, 'undone-reload-failed');
    assert.equal(hasLegacyMigrationUndo('chat-42'), false);
    cleanup();

    let postUndoInspectionFailed = false;
    let throwingContext;
    const initialMsg = getFixtureMessage('ff-normal');
    const liveChat = [{ mes: initialMsg, is_user: false }];
    const liveMetadata = {};

    throwingContext = {
        chatId: 'chat-42',
        get chat() {
            if (postUndoInspectionFailed) {
                throw new Error('post-undo inspection failure');
            }
            return liveChat;
        },
        chatMetadata: liveMetadata,
        saveChatCalls: 0,
        reloadCalls: 0,
        saveChat: async function () {
            this.saveChatCalls += 1;
            if (this.saveChatCalls === 2) {
                postUndoInspectionFailed = true;
            }
        },
        reloadCurrentChat: async function () {
            this.reloadCalls += 1;
        },
    };

    globalThis.SillyTavern = {
        getContext: () => throwingContext,
    };

    const fixture = createPlanFixture(liveChat);
    const applyRes = await applyLegacyMigration(
        'chat-42',
        fixture.inventory,
        fixture.mappings,
        fixture.preview,
    );
    assert.equal(applyRes.status, 'applied');
    assert.equal(throwingContext.saveChatCalls, 1);

    const undoRes = await undoLastLegacyMigration('chat-42');
    assert.equal(undoRes.status, 'undone-concurrent-change');
    assert.notEqual(undoRes.status, 'save-error');
    assert.notEqual(undoRes.status, 'save-error-rollback-incomplete');
    assert.equal(throwingContext.saveChatCalls, 2);
    assert.equal(liveChat[0].mes, initialMsg);
    assert.equal(
        Object.prototype.hasOwnProperty.call(liveMetadata, CHAT_METADATA_KEY),
        false,
    );
    assert.equal(hasLegacyMigrationUndo('chat-42'), false);

    const secondUndo = await undoLastLegacyMigration('chat-42');
    assert.deepEqual(secondUndo, { status: 'no-undo' });

    cleanup();
});