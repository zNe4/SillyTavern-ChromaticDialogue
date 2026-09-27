import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createLegacyMigrationWizardController } from '../src/legacy-migration-wizard-controller.js';
import { clearAllLegacyMigrationUndos } from '../src/legacy-migration-undo-store.js';

function createBasicChatContext(chatId = 'chat-1', chat = null, metadata = {}) {
    return {
        chatId,
        chat: chat ?? [
            {
                is_user: false,
                is_system: false,
                mes: 'Hello <cyan>"world"</cyan>!',
            },
        ],
        chatMetadata: { ...metadata },
    };
}

test('1. new controller exposes exact initial detached state.', () => {
    const controller = createLegacyMigrationWizardController();
    const state = controller.getState();

    assert.equal(state.phase, 'idle');
    assert.equal(state.chatId, null);
    assert.equal(state.includeIntroduction, false);
    assert.equal(state.inventory, null);
    assert.deepEqual(state.mappings, []);
    assert.equal(state.preview, null);
    assert.equal(state.lastResult, null);
    assert.equal(state.undoAvailable, false);
    assert.equal(state.requiredMappingCount, 0);
    assert.equal(state.completedMappingCount, 0);
    assert.equal(state.canPreview, false);
    assert.equal(state.canApply, false);

    state.phase = 'mutated';
    state.mappings.push({ sourceKey: 'x', action: 'skip' });
    const freshState = controller.getState();
    assert.equal(freshState.phase, 'idle');
    assert.deepEqual(freshState.mappings, []);
});

test('2. initial includeIntroduction is false and mappings are empty.', () => {
    const controller = createLegacyMigrationWizardController();
    const state = controller.getState();

    assert.equal(state.includeIntroduction, false);
    assert.equal(Array.isArray(state.mappings), true);
    assert.equal(state.mappings.length, 0);
});

test('3. scan with no context -> no-chat.', () => {
    const controller = createLegacyMigrationWizardController({
        getContext: () => null,
    });

    const result = controller.scan();
    assert.deepEqual(result, { status: 'no-chat' });
    assert.equal(controller.getState().phase, 'idle');

    const throwingController = createLegacyMigrationWizardController({
        getContext: () => {
            throw new Error('context access failed');
        },
    });
    const throwResult = throwingController.scan();
    assert.deepEqual(throwResult, { status: 'no-chat' });
});

test('4. scan with malformed context -> invalid-context.', () => {
    const controller = createLegacyMigrationWizardController({
        getContext: () => ({
            chatId: 'chat-1',
            chat: 'not-an-array',
            chatMetadata: {},
        }),
    });

    const result = controller.scan();
    assert.deepEqual(result, { status: 'invalid-context' });

    const controller2 = createLegacyMigrationWizardController({
        getContext: () => ({
            chatId: 'chat-1',
            chat: [],
            chatMetadata: null,
        }),
    });
    assert.deepEqual(controller2.scan(), { status: 'invalid-context' });
});

test('5. scan with missing CD metadata uses empty strict state.', () => {
    let capturedState = null;
    const controller = createLegacyMigrationWizardController({
        getContext: () => ({
            chatId: 'chat-1',
            chat: [
                {
                    is_user: false,
                    is_system: false,
                    mes: 'Hello <cyan>"world"</cyan>!',
                },
            ],
            chatMetadata: {},
        }),
        buildInventory: (chat, state, options) => {
            capturedState = state;
            return {
                status: 'ready',
                includeIntroduction: options?.includeIntroduction === true,
                occurrences: [],
                groups: [],
                issues: [],
                skippedMessages: [],
                existingAssignments: [],
                stats: {
                    messageCount: 1,
                    scannedMessageCount: 1,
                    skippedMessageCount: 0,
                    occurrenceCount: 0,
                    migratableCount: 0,
                    unknownColoredCount: 0,
                    issueCount: 0,
                    sourceGroupCount: 0,
                },
            };
        },
    });

    const result = controller.scan();
    assert.equal(result.status, 'ready');
    assert.deepEqual(capturedState, {
        schemaVersion: 1,
        assignments: {},
    });
});

test('6. scan with malformed existing CD metadata -> invalid-state.', () => {
    const controller = createLegacyMigrationWizardController({
        getContext: () => ({
            chatId: 'chat-1',
            chat: [],
            chatMetadata: {
                chromatic_dialogue: {
                    schemaVersion: 999,
                    assignments: {},
                },
            },
        }),
    });

    const result = controller.scan();
    assert.deepEqual(result, { status: 'invalid-state' });
});

test('7. successful scan enters mapping phase and captures chatId/inventory.', () => {
    const context = createBasicChatContext('chat-alpha', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    const result = controller.scan();
    assert.equal(result.status, 'ready');
    assert.ok(result.inventory);

    const state = controller.getState();
    assert.equal(state.phase, 'mapping');
    assert.equal(state.chatId, 'chat-alpha');
    assert.equal(state.inventory.status, 'ready');
    assert.equal(state.requiredMappingCount, 1);
    assert.equal(state.completedMappingCount, 0);
});

test('8. successful scan reports current session undo availability.', () => {
    const context = createBasicChatContext('chat-undo-check');

    const controllerWithUndo = createLegacyMigrationWizardController({
        getContext: () => context,
        hasUndo: (id) => id === 'chat-undo-check',
    });

    const scanResult = controllerWithUndo.scan();
    assert.equal(scanResult.status, 'ready');
    assert.equal(controllerWithUndo.getState().undoAvailable, true);

    const controllerWithoutUndo = createLegacyMigrationWizardController({
        getContext: () => context,
        hasUndo: () => false,
    });

    controllerWithoutUndo.scan();
    assert.equal(controllerWithoutUndo.getState().undoAvailable, false);
});

test('9. default scan excludes assistant intro through real B3.2.', () => {
    const context = createBasicChatContext('chat-intro', [
        {
            is_user: false,
            is_system: false,
            mes: 'Intro <cyan>"greeting"</cyan>',
        },
        {
            is_user: true,
            is_system: false,
            mes: 'User message <cyan>"reply"</cyan>',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    const result = controller.scan();
    assert.equal(result.status, 'ready');
    assert.equal(result.inventory.includeIntroduction, false);
    assert.equal(
        result.inventory.skippedMessages.some(
            (m) => m.messageIndex === 0 && m.reason === 'intro-message',
        ),
        true,
    );
    assert.equal(result.inventory.occurrences.length, 1);
    assert.equal(result.inventory.occurrences[0].messageIndex, 1);
});

test('10. setIncludeIntroduction(true) rescans and includes intro.', () => {
    const context = createBasicChatContext('chat-intro-2', [
        {
            is_user: false,
            is_system: false,
            mes: 'Intro <cyan>"greeting"</cyan>',
        },
        {
            is_user: true,
            is_system: false,
            mes: 'User message <cyan>"reply"</cyan>',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    const updateResult = controller.setIncludeIntroduction(true);

    assert.equal(updateResult.status, 'ready');
    assert.equal(controller.getState().includeIntroduction, true);
    assert.equal(updateResult.inventory.includeIntroduction, true);
    assert.equal(updateResult.inventory.occurrences.length, 2);
});

test('11. changing intro preference clears mappings and preview.', () => {
    const context = createBasicChatContext('chat-intro-3', [
        {
            is_user: true,
            is_system: false,
            mes: 'User <cyan>"one"</cyan>',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    controller.setMapping('named:cyan', { action: 'skip' });
    assert.equal(controller.getState().completedMappingCount, 1);

    controller.setIncludeIntroduction(true);
    const state = controller.getState();
    assert.equal(state.mappings.length, 0);
    assert.equal(state.preview, null);
    assert.equal(state.completedMappingCount, 0);
});

test('12. setting the same intro value does not rescan.', () => {
    let scanCalls = 0;
    const controller = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-same-intro'),
        buildInventory: () => {
            scanCalls += 1;
            return {
                status: 'ready',
                includeIntroduction: false,
                occurrences: [],
                groups: [],
                issues: [],
                skippedMessages: [],
                existingAssignments: [],
                stats: {},
            };
        },
    });

    const result = controller.setIncludeIntroduction(false);
    assert.deepEqual(result, { status: 'unchanged', includeIntroduction: false });
    assert.equal(scanCalls, 0);
});

test('13. every explicit successful rescan clears previous human mappings.', () => {
    const context = createBasicChatContext('chat-rescan', [
        {
            is_user: true,
            is_system: false,
            mes: 'User <cyan>"one"</cyan>',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    controller.setMapping('named:cyan', { action: 'skip' });
    assert.equal(controller.getState().mappings.length, 1);

    controller.scan();
    const state = controller.getState();
    assert.equal(state.mappings.length, 0);
    assert.equal(state.preview, null);
});

test('14. non-ready inventory result -> inventory-error and unusable inventory cleared.', () => {
    const controller = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-inv-err'),
        buildInventory: () => ({
            status: 'unsupported-state',
            includeIntroduction: false,
            occurrences: [],
            groups: [],
            issues: [],
            skippedMessages: [],
            existingAssignments: [],
            stats: {},
        }),
    });

    const result = controller.scan();
    assert.deepEqual(result, {
        status: 'inventory-error',
        inventoryStatus: 'unsupported-state',
    });

    const state = controller.getState();
    assert.equal(state.phase, 'error');
    assert.equal(state.inventory, null);
    assert.deepEqual(state.mappings, []);
    assert.equal(state.preview, null);
});

test('15. unknown sourceKey cannot be mapped.', () => {
    const context = createBasicChatContext('chat-unknown-key', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    const result = controller.setMapping('named:orange', { action: 'skip' });
    assert.deepEqual(result, { status: 'unknown-source' });
});

test('16. unknown-colored-only/non-migratable group cannot be mapped.', () => {
    const controller = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-non-migratable'),
        buildInventory: () => ({
            status: 'ready',
            includeIntroduction: false,
            occurrences: [],
            groups: [
                {
                    sourceKey: 'hex:#123456',
                    migratableCount: 0,
                    unknownColoredCount: 1,
                },
            ],
            issues: [],
            skippedMessages: [],
            existingAssignments: [],
            stats: { migratableCount: 0, unknownColoredCount: 1 },
        }),
    });

    controller.scan();
    const result = controller.setMapping('hex:#123456', { action: 'skip' });
    assert.deepEqual(result, { status: 'source-not-migratable' });
});

test('17. exact skip draft is accepted.', () => {
    const context = createBasicChatContext('chat-skip', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    const result = controller.setMapping('named:cyan', { action: 'skip' });
    assert.deepEqual(result, {
        status: 'updated',
        mapping: {
            sourceKey: 'named:cyan',
            action: 'skip',
        },
    });
    assert.deepEqual(controller.getState().mappings, [
        { sourceKey: 'named:cyan', action: 'skip' },
    ]);
});

test('18. reuse draft with assignmentId is accepted.', () => {
    const context = createBasicChatContext('chat-reuse', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    const result = controller.setMapping('named:cyan', {
        action: 'reuse',
        assignmentId: 'c1',
    });
    assert.deepEqual(result, {
        status: 'updated',
        mapping: {
            sourceKey: 'named:cyan',
            action: 'reuse',
            assignmentId: 'c1',
        },
    });
    assert.deepEqual(controller.getState().mappings, [
        { sourceKey: 'named:cyan', action: 'reuse', assignmentId: 'c1' },
    ]);
});

test('19. create draft with name/color is accepted.', () => {
    const context = createBasicChatContext('chat-create', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    const result = controller.setMapping('named:cyan', {
        action: 'create',
        name: 'Alice',
        color: '#00FFFF',
    });
    assert.deepEqual(result, {
        status: 'updated',
        mapping: {
            sourceKey: 'named:cyan',
            action: 'create',
            name: 'Alice',
            color: '#00FFFF',
        },
    });
});

test('20. create blank strings may be stored as an editing draft.', () => {
    const context = createBasicChatContext('chat-blank-create', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    const result = controller.setMapping('named:cyan', {
        action: 'create',
        name: '',
        color: '',
    });
    assert.deepEqual(result, {
        status: 'updated',
        mapping: {
            sourceKey: 'named:cyan',
            action: 'create',
            name: '',
            color: '',
        },
    });
});

test('21. invalid action/extra properties are rejected.', () => {
    const context = createBasicChatContext('chat-invalid-draft', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    assert.deepEqual(
        controller.setMapping('named:cyan', { action: 'unknown' }),
        { status: 'invalid-draft' },
    );
    assert.deepEqual(
        controller.setMapping('named:cyan', {
            action: 'skip',
            extra: 'forbidden',
        }),
        { status: 'invalid-draft' },
    );
    assert.deepEqual(
        controller.setMapping('named:cyan', {
            action: 'reuse',
            assignmentId: 'c1',
            extra: true,
        }),
        { status: 'invalid-draft' },
    );
    assert.deepEqual(
        controller.setMapping('named:cyan', {
            action: 'create',
            name: 'Bob',
            color: '#123456',
            unexpected: 1,
        }),
        { status: 'invalid-draft' },
    );
});

test('22. setting same source again replaces rather than duplicates mapping.', () => {
    const context = createBasicChatContext('chat-replace', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    controller.setMapping('named:cyan', { action: 'skip' });
    controller.setMapping('named:cyan', {
        action: 'reuse',
        assignmentId: 'c2',
    });

    const mappings = controller.getState().mappings;
    assert.equal(mappings.length, 1);
    assert.deepEqual(mappings[0], {
        sourceKey: 'named:cyan',
        action: 'reuse',
        assignmentId: 'c2',
    });
});

test('23. clearMapping removes an existing draft and invalidates preview.', () => {
    const context = createBasicChatContext('chat-clear', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    controller.setMapping('named:cyan', { action: 'skip' });
    assert.equal(controller.getState().mappings.length, 1);

    const result = controller.clearMapping('named:cyan');
    assert.deepEqual(result, { status: 'cleared', sourceKey: 'named:cyan' });
    assert.equal(controller.getState().mappings.length, 0);

    const notFound = controller.clearMapping('named:cyan');
    assert.deepEqual(notFound, { status: 'not-found' });
});

test('24. mapping edit after preview returns controller to mapping phase.', () => {
    const context = createBasicChatContext('chat-edit-after-preview', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    controller.setMapping('named:cyan', { action: 'skip' });
    const previewResult = controller.preview();
    assert.equal(previewResult.status, 'ready');
    assert.equal(controller.getState().phase, 'preview');

    controller.setMapping('named:cyan', {
        action: 'create',
        name: 'Alice',
        color: '#00FFFF',
    });
    assert.equal(controller.getState().phase, 'mapping');
    assert.equal(controller.getState().preview, null);
});

test('25. requiredMappingCount counts only migratable groups.', () => {
    const controller = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-counts'),
        buildInventory: () => ({
            status: 'ready',
            includeIntroduction: false,
            occurrences: [],
            groups: [
                { sourceKey: 'named:cyan', migratableCount: 2 },
                { sourceKey: 'named:pink', migratableCount: 1 },
                { sourceKey: 'hex:#123456', migratableCount: 0 },
            ],
            issues: [],
            skippedMessages: [],
            existingAssignments: [],
            stats: {},
        }),
    });

    controller.scan();
    assert.equal(controller.getState().requiredMappingCount, 2);
});

test('26. completedMappingCount tracks stored drafts.', () => {
    const controller = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-completed-count'),
        buildInventory: () => ({
            status: 'ready',
            includeIntroduction: false,
            occurrences: [],
            groups: [
                { sourceKey: 'named:cyan', migratableCount: 2 },
                { sourceKey: 'named:pink', migratableCount: 1 },
            ],
            issues: [],
            skippedMessages: [],
            existingAssignments: [],
            stats: {},
        }),
    });

    controller.scan();
    assert.equal(controller.getState().completedMappingCount, 0);

    controller.setMapping('named:cyan', { action: 'skip' });
    assert.equal(controller.getState().completedMappingCount, 1);

    controller.setMapping('named:pink', {
        action: 'create',
        name: '',
        color: '',
    });
    assert.equal(controller.getState().completedMappingCount, 2);

    controller.clearMapping('named:cyan');
    assert.equal(controller.getState().completedMappingCount, 1);
});

test('27. canPreview false until every migratable source has explicit draft.', () => {
    const controller = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-can-preview-false'),
        buildInventory: () => ({
            status: 'ready',
            includeIntroduction: false,
            occurrences: [],
            groups: [
                { sourceKey: 'named:cyan', migratableCount: 1 },
                { sourceKey: 'named:pink', migratableCount: 1 },
            ],
            issues: [],
            skippedMessages: [],
            existingAssignments: [],
            stats: {},
        }),
    });

    controller.scan();
    assert.equal(controller.getState().canPreview, false);

    controller.setMapping('named:cyan', { action: 'skip' });
    assert.equal(controller.getState().canPreview, false);
});

test('28. canPreview true when every source has a structural draft.', () => {
    const controller = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-can-preview-true'),
        buildInventory: () => ({
            status: 'ready',
            includeIntroduction: false,
            occurrences: [],
            groups: [
                { sourceKey: 'named:cyan', migratableCount: 1 },
                { sourceKey: 'named:pink', migratableCount: 1 },
            ],
            issues: [],
            skippedMessages: [],
            existingAssignments: [],
            stats: {},
        }),
    });

    controller.scan();
    controller.setMapping('named:cyan', { action: 'skip' });
    controller.setMapping('named:pink', {
        action: 'create',
        name: '',
        color: '',
    });

    assert.equal(controller.getState().canPreview, true);
});

test('29. zero-migratable inventory permits preview with zero mappings.', () => {
    const context = createBasicChatContext('chat-zero-migratable', [
        {
            is_user: true,
            is_system: false,
            mes: 'Plain message without colors',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    const state = controller.getState();
    assert.equal(state.requiredMappingCount, 0);
    assert.equal(state.completedMappingCount, 0);
    assert.equal(state.canPreview, true);

    const previewResult = controller.preview();
    assert.equal(previewResult.status, 'ready');
    assert.equal(controller.getState().phase, 'preview');
});

test('30. B3.2 suggestedAssignmentId/suggestedFinalColor NEVER populate mappings automatically.', () => {
    const context = createBasicChatContext('chat-no-auto-suggest', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ], {
        chromatic_dialogue: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'CyanChar', color: '#00FFFF' },
            },
        },
    });

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    const result = controller.scan();
    assert.equal(result.status, 'ready');

    const group = result.inventory.groups.find((g) => g.sourceKey === 'named:cyan');
    assert.ok(group);
    assert.equal(group.suggestedAssignmentId, 'c1');
    assert.equal(group.suggestedFinalColor, '#00FFFF');

    const state = controller.getState();
    assert.deepEqual(state.mappings, []);
    assert.equal(state.completedMappingCount, 0);
    assert.equal(state.canPreview, false);
});

test('31. preview with incomplete mappings -> incomplete-mappings and planner not called.', () => {
    let plannerCalled = false;
    const controller = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-incomplete'),
        buildInventory: () => ({
            status: 'ready',
            includeIntroduction: false,
            occurrences: [],
            groups: [
                { sourceKey: 'named:cyan', migratableCount: 1 },
                { sourceKey: 'named:pink', migratableCount: 1 },
            ],
            issues: [],
            skippedMessages: [],
            existingAssignments: [],
            stats: {},
        }),
        planMigration: () => {
            plannerCalled = true;
            return { status: 'ready' };
        },
    });

    controller.scan();
    controller.setMapping('named:cyan', { action: 'skip' });

    const result = controller.preview();
    assert.deepEqual(result, { status: 'incomplete-mappings' });
    assert.equal(plannerCalled, false);
});

test('32. active chat change before preview -> chat-changed.', () => {
    let activeContext = createBasicChatContext('chat-alpha', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => activeContext,
    });

    controller.scan();
    controller.setMapping('named:cyan', { action: 'skip' });

    activeContext = createBasicChatContext('chat-beta', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);
    const chatChangedResult = controller.preview();
    assert.deepEqual(chatChangedResult, { status: 'chat-changed' });

    let sameIdContext = createBasicChatContext('chat-same', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controllerSame = createLegacyMigrationWizardController({
        getContext: () => sameIdContext,
    });

    controllerSame.scan();
    controllerSame.setMapping('named:cyan', { action: 'skip' });

    sameIdContext = {
        chatId: 'chat-same',
        chat: 'not-an-array',
        chatMetadata: {},
    };

    const invalidContextResult = controllerSame.preview();
    assert.deepEqual(invalidContextResult, { status: 'invalid-context' });
});

test('33. ready real B3.3 preview enters preview phase and canApply=true.', () => {
    const context = createBasicChatContext('chat-real-planner', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    controller.setMapping('named:cyan', {
        action: 'create',
        name: 'Alice',
        color: '#00FFFF',
    });

    const result = controller.preview();
    assert.equal(result.status, 'ready');
    assert.ok(result.preview);

    const state = controller.getState();
    assert.equal(state.phase, 'preview');
    assert.equal(state.canApply, true);
    assert.equal(state.preview.status, 'ready');
});

test('34. planner invalid mapping is surfaced as plan-rejected with exact planner status/errors.', () => {
    const context = createBasicChatContext('chat-rejected-plan', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    controller.setMapping('named:cyan', {
        action: 'create',
        name: '',
        color: '#00FFFF',
    });

    const result = controller.preview();
    assert.equal(result.status, 'plan-rejected');
    assert.equal(result.planStatus, 'invalid-mappings');
    assert.ok(
        result.errors.some(
            (e) => e.code === 'invalid-name' && e.sourceKey === 'named:cyan',
        ),
    );

    const state = controller.getState();
    assert.equal(state.phase, 'mapping');
    assert.equal(state.preview, null);
    assert.equal(state.canApply, false);
    assert.ok(state.lastResult);
});

test('35. planner stale-inventory does not silently rescan or discard human mapping drafts.', () => {
    const context = createBasicChatContext('chat-stale-inv', [
        {
            is_user: true,
            is_system: false,
            mes: 'Hello <cyan>"world"</cyan>!',
        },
    ]);

    const controller = createLegacyMigrationWizardController({
        getContext: () => context,
    });

    controller.scan();
    controller.setMapping('named:cyan', {
        action: 'create',
        name: 'Alice',
        color: '#00FFFF',
    });

    context.chat[0].mes = 'Different message content!';

    const result = controller.preview();
    assert.equal(result.status, 'plan-rejected');
    assert.equal(result.planStatus, 'stale-inventory');

    const state = controller.getState();
    assert.equal(state.mappings.length, 1);
    assert.deepEqual(state.mappings[0], {
        sourceKey: 'named:cyan',
        action: 'create',
        name: 'Alice',
        color: '#00FFFF',
    });
});

test('36. mappings passed to B3.3 are ordered by inventory group order, not editing order.', () => {
    let passedMappings = null;
    const controller = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-mapping-order'),
        buildInventory: () => ({
            status: 'ready',
            includeIntroduction: false,
            occurrences: [
                {
                    messageIndex: 0,
                    role: 'user',
                    adapter: 'legacy-ff',
                    sourceType: 'named',
                    sourceValue: 'cyan',
                    sourceKey: 'named:cyan',
                    tone: null,
                    classification: 'valid-colored-dialogue',
                    migratable: true,
                    content: 'one',
                    quoteStyle: 'double',
                    raw: '<cyan>"one"</cyan>',
                    range: { start: 0, end: 18 },
                },
                {
                    messageIndex: 0,
                    role: 'user',
                    adapter: 'legacy-ff',
                    sourceType: 'named',
                    sourceValue: 'pink',
                    sourceKey: 'named:pink',
                    tone: null,
                    classification: 'valid-colored-dialogue',
                    migratable: true,
                    content: 'two',
                    quoteStyle: 'double',
                    raw: '<pink>"two"</pink>',
                    range: { start: 19, end: 37 },
                },
            ],
            groups: [
                { sourceKey: 'named:cyan', migratableCount: 1 },
                { sourceKey: 'named:pink', migratableCount: 1 },
            ],
            issues: [],
            skippedMessages: [],
            existingAssignments: [],
            stats: {
                messageCount: 1,
                scannedMessageCount: 1,
                skippedMessageCount: 0,
                occurrenceCount: 2,
                migratableCount: 2,
                unknownColoredCount: 0,
                issueCount: 0,
                sourceGroupCount: 2,
            },
        }),
        planMigration: (chat, state, inv, mappings) => {
            passedMappings = mappings;
            return {
                status: 'ready',
                errors: [],
                sourcePlans: [],
                newAssignments: [],
                reusedAssignments: [],
                messageChanges: [],
                plannedState: state,
                stats: {},
            };
        },
    });

    controller.scan();
    controller.setMapping('named:pink', { action: 'skip' });
    controller.setMapping('named:cyan', { action: 'skip' });

    controller.preview();
    assert.ok(passedMappings);
    assert.equal(passedMappings[0].sourceKey, 'named:cyan');
    assert.equal(passedMappings[1].sourceKey, 'named:pink');
});

test('37. apply without ready preview -> no-preview; ready preview delegates exact chatId/inventory/mappings/preview to B3.4 and persisted-success status enters applied phase.', async () => {
    let capturedArgs = null;
    const controller = createLegacyMigrationWizardController({
        getContext: () =>
            createBasicChatContext('chat-apply-success', [
                {
                    is_user: true,
                    is_system: false,
                    mes: 'Hello <cyan>"world"</cyan>!',
                },
            ]),
        applyMigration: async (cId, inv, mapps, prev) => {
            capturedArgs = { cId, inv, mapps, prev };
            return {
                status: 'applied',
                chatId: cId,
                undoAvailable: true,
                stats: {},
            };
        },
        hasUndo: () => true,
    });

    const earlyApply = await controller.apply();
    assert.deepEqual(earlyApply, { status: 'no-preview' });

    controller.scan();
    controller.setMapping('named:cyan', {
        action: 'create',
        name: 'Alice',
        color: '#00FFFF',
    });
    controller.preview();

    const applyResult = await controller.apply();
    assert.equal(applyResult.status, 'applied');
    assert.equal(capturedArgs.cId, 'chat-apply-success');
    assert.equal(capturedArgs.mapps[0].sourceKey, 'named:cyan');

    const state = controller.getState();
    assert.equal(state.phase, 'applied');
    assert.equal(state.undoAvailable, true);
});

test('38. transient B3.4 busy keeps approved preview usable, while stale/rejected apply invalidates preview according to contract.', async () => {
    let applyStatus = 'busy';
    const controller = createLegacyMigrationWizardController({
        getContext: () =>
            createBasicChatContext('chat-apply-transient', [
                {
                    is_user: true,
                    is_system: false,
                    mes: 'Hello <cyan>"world"</cyan>!',
                },
            ]),
        applyMigration: async () => ({ status: applyStatus }),
    });

    controller.scan();
    controller.setMapping('named:cyan', { action: 'skip' });
    controller.preview();

    const busyResult = await controller.apply();
    assert.deepEqual(busyResult, { status: 'busy' });
    assert.equal(controller.getState().phase, 'preview');
    assert.equal(controller.getState().canApply, true);

    applyStatus = 'stale-preview';
    const staleResult = await controller.apply();
    assert.deepEqual(staleResult, { status: 'stale-preview' });
    assert.equal(controller.getState().phase, 'mapping');
    assert.equal(controller.getState().preview, null);
    assert.equal(controller.getState().canApply, false);
});

test('39. undo works in a fresh controller using current chatId, delegates to B3.4, successful undo enters undone phase and consumed undo becomes unavailable.', async () => {
    let hasSnapshot = true;
    let delegatedChatId = null;

    const controller = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-undo-flow'),
        hasUndo: (id) => hasSnapshot && id === 'chat-undo-flow',
        undoMigration: async (cId) => {
            delegatedChatId = cId;
            hasSnapshot = false;
            return {
                status: 'undone',
                chatId: cId,
            };
        },
    });

    const result = await controller.undo();
    assert.deepEqual(result, {
        status: 'undone',
        chatId: 'chat-undo-flow',
    });
    assert.equal(delegatedChatId, 'chat-undo-flow');

    const state = controller.getState();
    assert.equal(state.phase, 'undone');
    assert.equal(state.undoAvailable, false);

    const secondUndo = await controller.undo();
    assert.deepEqual(secondUndo, { status: 'no-undo' });
});

test('40. reset clears only wizard workflow state, never deletes B3.4 undo; getState and dependency results remain deeply detached and unexpected dependency errors return operation-error rather than throwing.', async () => {
    clearAllLegacyMigrationUndos();

    const controller = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-reset-test'),
        hasUndo: () => true,
    });

    controller.scan();
    controller.setMapping('named:cyan', { action: 'skip' });

    const resetState = controller.reset();
    assert.equal(resetState.phase, 'idle');
    assert.equal(resetState.chatId, null);
    assert.equal(resetState.includeIntroduction, false);
    assert.equal(resetState.inventory, null);
    assert.deepEqual(resetState.mappings, []);
    assert.equal(resetState.preview, null);
    assert.equal(resetState.lastResult, null);
    assert.equal(resetState.undoAvailable, true);

    const throwingScanController = createLegacyMigrationWizardController({
        getContext: () => createBasicChatContext('chat-throw'),
        buildInventory: () => {
            throw new Error('scanner crashed');
        },
    });
    const errorResult = throwingScanController.scan();
    assert.deepEqual(errorResult, { status: 'operation-error' });
    assert.equal(throwingScanController.getState().phase, 'error');

    const sourcePath = new URL(
        '../src/legacy-migration-wizard-controller.js',
        import.meta.url,
    );
    const sourceContent = readFileSync(sourcePath, 'utf8');

    assert.equal(sourceContent.includes('document.querySelector'), false);
    assert.equal(sourceContent.includes("$('#"), false);
    assert.equal(sourceContent.includes('new Popup'), false);
    assert.equal(sourceContent.includes('POPUP_TYPE'), false);
    assert.equal(sourceContent.includes('.saveChat('), false);
    assert.equal(sourceContent.includes('saveMetadata('), false);
    assert.equal(sourceContent.includes('.mes ='), false);

    assert.equal(sourceContent.includes('buildLegacyChatInventory'), true);
    assert.equal(sourceContent.includes('planLegacyMigration'), true);
    assert.equal(sourceContent.includes('applyLegacyMigration'), true);
    assert.equal(sourceContent.includes('undoLastLegacyMigration'), true);
});