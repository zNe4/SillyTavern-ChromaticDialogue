import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildLegacyChatInventory } from '../src/legacy-chat-inventory.js';
import { planLegacyMigration } from '../src/legacy-migration-planner.js';

test('1. non-array chat -> invalid-chat exact failure shape', () => {
    const invalidChats = [null, undefined, 42, 'chat', {}, true, Symbol('chat')];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory([], state);

    for (const input of invalidChats) {
        const result = planLegacyMigration(input, state, inventory, []);
        assert.deepEqual(result, {
            status: 'invalid-chat',
            errors: [
                {
                    code: 'invalid-chat',
                    sourceKey: null,
                },
            ],
            sourcePlans: [],
            newAssignments: [],
            reusedAssignments: [],
            messageChanges: [],
            plannedState: null,
            stats: null,
        });
    }
});

test('2. malformed current strict state -> invalid-state', () => {
    const badStates = [
        null,
        undefined,
        123,
        'state',
        { schemaVersion: 999, assignments: {} },
        { schemaVersion: 1, assignments: 'not-an-object' },
        { schemaVersion: 1, assignments: { badId: { name: 'Alice', color: '#112233' } } },
        { schemaVersion: 1, assignments: { c1: { name: '', color: '#112233' } } },
        { schemaVersion: 1, assignments: { c1: { name: 'Alice', color: 'invalid-hex' } } },
    ];

    const chat = [{ mes: 'Intro' }, { is_user: true, mes: '<gold>"Hello."</gold>' }];
    const goodState = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, goodState);

    for (const badState of badStates) {
        const result = planLegacyMigration(chat, badState, inventory, []);
        assert.deepEqual(result, {
            status: 'invalid-state',
            errors: [
                {
                    code: 'invalid-state',
                    sourceKey: null,
                },
            ],
            sourcePlans: [],
            newAssignments: [],
            reusedAssignments: [],
            messageChanges: [],
            plannedState: null,
            stats: null,
        });
    }
});

test('3. non-ready inventory -> invalid-inventory', () => {
    const chat = [{ mes: 'Intro' }, { is_user: true, mes: '<gold>"Hello."</gold>' }];
    const state = { schemaVersion: 1, assignments: {} };

    const nonReadyInventories = [
        { status: 'invalid-chat' },
        { status: 'unsupported-state' },
        { status: 'error' },
        { status: null },
    ];

    for (const inv of nonReadyInventories) {
        const result = planLegacyMigration(chat, state, inv, []);
        assert.deepEqual(result, {
            status: 'invalid-inventory',
            errors: [
                {
                    code: 'invalid-inventory',
                    sourceKey: null,
                },
            ],
            sourcePlans: [],
            newAssignments: [],
            reusedAssignments: [],
            messageChanges: [],
            plannedState: null,
            stats: null,
        });
    }
});

test('4. malformed inventory -> invalid-inventory', () => {
    const chat = [{ mes: 'Intro' }, { is_user: true, mes: '<gold>"Hello."</gold>' }];
    const state = { schemaVersion: 1, assignments: {} };
    const validInv = buildLegacyChatInventory(chat, state);

    const malformedCandidates = [
        null,
        undefined,
        'inventory',
        [],
        { ...validInv, occurrences: null },
        { ...validInv, groups: 'not-array' },
        { ...validInv, existingAssignments: {} },
        { ...validInv, stats: null },
        { ...validInv, includeIntroduction: 'yes' },
    ];

    for (const badInv of malformedCandidates) {
        const result = planLegacyMigration(chat, state, badInv, []);
        assert.deepEqual(result, {
            status: 'invalid-inventory',
            errors: [
                {
                    code: 'invalid-inventory',
                    sourceKey: null,
                },
            ],
            sourcePlans: [],
            newAssignments: [],
            reusedAssignments: [],
            messageChanges: [],
            plannedState: null,
            stats: null,
        });
    }
});

test('5. current legacy occurrence changed after inventory -> stale-inventory', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Initial speech."</gold>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const modifiedChat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<teal>"Changed speech."</teal>' },
    ];

    const result = planLegacyMigration(modifiedChat, state, inventory, [
        { sourceKey: 'named:gold', action: 'skip' },
    ]);

    assert.deepEqual(result, {
        status: 'stale-inventory',
        errors: [
            {
                code: 'stale-inventory',
                sourceKey: null,
            },
        ],
        sourcePlans: [],
        newAssignments: [],
        reusedAssignments: [],
        messageChanges: [],
        plannedState: null,
        stats: null,
    });
});

test('6. current existing assignment changed after inventory -> stale-inventory', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Hello."</gold>' },
    ];
    const initialUserState = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#FFD700' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, initialUserState);

    const modifiedUserState = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Mara', color: '#FFD700' },
        },
    };

    const result = planLegacyMigration(chat, modifiedUserState, inventory, [
        { sourceKey: 'named:gold', action: 'reuse', assignmentId: 'c1' },
    ]);

    assert.deepEqual(result, {
        status: 'stale-inventory',
        errors: [
            {
                code: 'stale-inventory',
                sourceKey: null,
            },
        ],
        sourcePlans: [],
        newAssignments: [],
        reusedAssignments: [],
        messageChanges: [],
        plannedState: null,
        stats: null,
    });
});

test('7. unchanged inventory remains valid', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Hello."</gold>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.errors.length, 0);
    assert.equal(result.messageChanges.length, 1);
});

test('8. planner does not mutate chat/state/inventory/mappings', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Dialogue."</gold>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#FFD700' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);
    const mappings = [
        { sourceKey: 'named:gold', action: 'reuse', assignmentId: 'c1' },
    ];

    const chatSnap = JSON.parse(JSON.stringify(chat));
    const stateSnap = JSON.parse(JSON.stringify(state));
    const invSnap = JSON.parse(JSON.stringify(inventory));
    const mappingsSnap = JSON.parse(JSON.stringify(mappings));

    planLegacyMigration(chat, state, inventory, mappings);

    assert.deepEqual(chat, chatSnap);
    assert.deepEqual(state, stateSnap);
    assert.deepEqual(inventory, invSnap);
    assert.deepEqual(mappings, mappingsSnap);
});

test('9. B3.2 unique suggestedAssignmentId is NOT auto-used when mapping is missing', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Matched gold dialogue."</gold>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Mara', color: '#FFD700' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    assert.equal(inventory.groups[0].suggestedAssignmentId, 'c1');

    const result = planLegacyMigration(chat, state, inventory, []);

    assert.equal(result.status, 'invalid-mappings');
    assert.deepEqual(result.errors, [
        {
            code: 'missing-mapping',
            sourceKey: 'named:gold',
        },
    ]);
    assert.equal(result.plannedState, null);
});

test('10. suggestedFinalColor is NOT auto-used when create color is absent', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Dialogue."</gold>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    assert.equal(inventory.groups[0].suggestedFinalColor, '#FFD700');

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara' },
    ]);

    assert.equal(result.status, 'invalid-mappings');
    assert.deepEqual(result.errors, [
        {
            code: 'invalid-color',
            sourceKey: 'named:gold',
        },
    ]);
});

test('11. every migratable group requires one explicit mapping', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Gold."</gold> and <teal>"Teal."</teal>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    assert.equal(inventory.groups.length, 2);

    const partialMappings = [
        { sourceKey: 'named:gold', action: 'skip' },
    ];
    const resPartial = planLegacyMigration(chat, state, inventory, partialMappings);
    assert.equal(resPartial.status, 'invalid-mappings');
    assert.deepEqual(resPartial.errors, [
        { code: 'missing-mapping', sourceKey: 'named:teal' },
    ]);

    const unknownKeyMappings = [
        { sourceKey: 'named:gold', action: 'skip' },
        { sourceKey: 'named:teal', action: 'skip' },
        { sourceKey: 'named:plum', action: 'skip' },
    ];
    const resUnknown = planLegacyMigration(chat, state, inventory, unknownKeyMappings);
    assert.equal(resUnknown.status, 'invalid-mappings');
    assert.deepEqual(resUnknown.errors, [
        { code: 'unknown-source-key', sourceKey: 'named:plum' },
    ]);

    const unmigratableChat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>Unquoted remark only.</gold>' },
    ];
    const unmigratableInv = buildLegacyChatInventory(unmigratableChat, state);
    assert.equal(unmigratableInv.groups[0].migratableCount, 0);

    const resUnmigratable = planLegacyMigration(unmigratableChat, state, unmigratableInv, [
        { sourceKey: 'named:gold', action: 'skip' },
    ]);
    assert.equal(resUnmigratable.status, 'invalid-mappings');
    assert.deepEqual(resUnmigratable.errors, [
        { code: 'source-not-migratable', sourceKey: 'named:gold' },
    ]);
});

test('12. zero-migratable inventory accepts mappings=[]', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: 'No legacy markup anywhere in chat.' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    assert.equal(inventory.groups.length, 0);

    const result = planLegacyMigration(chat, state, inventory, []);

    assert.equal(result.status, 'ready');
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.sourcePlans, []);
    assert.deepEqual(result.newAssignments, []);
    assert.deepEqual(result.reusedAssignments, []);
    assert.deepEqual(result.messageChanges, []);
    assert.deepEqual(result.plannedState, state);
    assert.deepEqual(result.stats, {
        sourceGroupCount: 0,
        migratableSourceGroupCount: 0,
        mappedSourceGroupCount: 0,
        skippedSourceGroupCount: 0,
        newAssignmentCount: 0,
        reusedAssignmentCount: 0,
        changedMessageCount: 0,
        migratedOccurrenceCount: 0,
        skippedMigratableCount: 0,
        unknownColoredCount: 0,
        issueCount: 0,
    });
});

test('13. exact skip shape accepted', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const badSkip = [
        { sourceKey: 'named:gold', action: 'skip', color: '#FFD700' },
    ];
    const resBad = planLegacyMigration(chat, state, inventory, badSkip);
    assert.equal(resBad.status, 'invalid-mappings');
    assert.deepEqual(resBad.errors, [
        { code: 'invalid-mapping', sourceKey: 'named:gold' },
    ]);

    const goodSkip = [
        { sourceKey: 'named:gold', action: 'skip' },
    ];
    const resGood = planLegacyMigration(chat, state, inventory, goodSkip);
    assert.equal(resGood.status, 'ready');
    assert.equal(resGood.sourcePlans.length, 1);
    assert.deepEqual(resGood.sourcePlans[0], {
        sourceKey: 'named:gold',
        action: 'skip',
        assignmentId: null,
        name: null,
        color: null,
        migratableCount: 1,
        unknownColoredCount: 0,
    });
});

test('14. skipped source produces no replacement', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: 'Before <gold>"Speech."</gold> After' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'skip' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.messageChanges.length, 0);
    assert.equal(result.stats.migratedOccurrenceCount, 0);
    assert.equal(result.stats.skippedMigratableCount, 1);
});

test('15. all sources skipped -> ready no-change plan', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Gold."</gold> <teal>"Teal."</teal>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'skip' },
        { sourceKey: 'named:teal', action: 'skip' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.messageChanges.length, 0);
    assert.equal(result.newAssignments.length, 0);
    assert.equal(result.reusedAssignments.length, 0);
    assert.deepEqual(result.plannedState, state);
    assert.equal(result.stats.mappedSourceGroupCount, 0);
    assert.equal(result.stats.skippedSourceGroupCount, 2);
    assert.equal(result.stats.skippedMigratableCount, 2);
});

test('16. skipped migratable count is exact', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"One"</gold> and <gold>"Two"</gold> and <teal>"Three"</teal>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'skip' },
        { sourceKey: 'named:teal', action: 'create', name: 'Alice', color: '#008080' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.stats.skippedMigratableCount, 2);
    assert.equal(result.stats.migratedOccurrenceCount, 1);
});

test('17. valid existing assignment reuse', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Reuse gold."</gold>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c2: { name: 'Mara', color: '#FFD700' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'reuse', assignmentId: 'c2' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.sourcePlans[0].action, 'reuse');
    assert.equal(result.sourcePlans[0].assignmentId, 'c2');
    assert.equal(result.sourcePlans[0].name, 'Mara');
    assert.equal(result.sourcePlans[0].color, '#FFD700');
    assert.equal(result.messageChanges[0].after, '[c2]Reuse gold.[/c]');
});

test('18. invalid assignment ID rejected', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#FFD700' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const invalidIds = ['c0', 'c100', '1', 'c01', 'id', '', null, 5];

    for (const badId of invalidIds) {
        const res = planLegacyMigration(chat, state, inventory, [
            { sourceKey: 'named:gold', action: 'reuse', assignmentId: badId },
        ]);
        assert.equal(res.status, 'invalid-mappings');
        assert.deepEqual(res.errors, [
            { code: 'invalid-assignment-id', sourceKey: 'named:gold' },
        ]);
    }

    const resUnknownAction = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'delete' },
    ]);
    assert.equal(resUnknownAction.status, 'invalid-mappings');
    assert.deepEqual(resUnknownAction.errors, [
        { code: 'invalid-action', sourceKey: 'named:gold' },
    ]);
});

test('19. valid but absent assignment rejected', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#FFD700' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'reuse', assignmentId: 'c2' },
    ]);

    assert.equal(result.status, 'invalid-mappings');
    assert.deepEqual(result.errors, [
        { code: 'assignment-not-found', sourceKey: 'named:gold' },
    ]);
});

test('20. source color need not equal reused assignment color', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<font color="#56B4E9">"Speech in blue."</font>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#FFAA00' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'hex:#56B4E9', action: 'reuse', assignmentId: 'c1' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.sourcePlans[0].assignmentId, 'c1');
    assert.equal(result.sourcePlans[0].color, '#FFAA00');
    assert.equal(result.messageChanges[0].after, '[c1]Speech in blue.[/c]');
});

test('21. multiple source groups may reuse the same existing assignment', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<font color="#56B4E9">"First."</font> <font color="#80CBC4">"Second."</font>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c2: { name: 'Mara', color: '#FFAA00' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'hex:#56B4E9', action: 'reuse', assignmentId: 'c2' },
        { sourceKey: 'hex:#80CBC4', action: 'reuse', assignmentId: 'c2' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.reusedAssignments.length, 1);
    assert.equal(result.messageChanges[0].after, '[c2]First.[/c] [c2]Second.[/c]');

    const dupResult = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'hex:#56B4E9', action: 'reuse', assignmentId: 'c2' },
        { sourceKey: 'hex:#56B4E9', action: 'reuse', assignmentId: 'c2' },
    ]);
    assert.equal(dupResult.status, 'invalid-mappings');
    assert.deepEqual(dupResult.errors, [
        { code: 'duplicate-source-mapping', sourceKey: 'hex:#56B4E9' },
        { code: 'missing-mapping', sourceKey: 'hex:#80CBC4' },
    ]);
});

test('22. reused assignment appears once in reusedAssignments', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"One"</gold> <teal>"Two"</teal>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c5: { name: 'Nemo', color: '#123456' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'reuse', assignmentId: 'c5' },
        { sourceKey: 'named:teal', action: 'reuse', assignmentId: 'c5' },
    ]);

    assert.equal(result.status, 'ready');
    assert.deepEqual(result.reusedAssignments, [
        { id: 'c5', name: 'Nemo', color: '#123456' },
    ]);
});

test('23. reuse never changes existing assignment name/color', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Original Name', color: '#AABBCC' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'reuse', assignmentId: 'c1' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.plannedState.assignments.c1.name, 'Original Name');
    assert.equal(result.plannedState.assignments.c1.color, '#AABBCC');
});

test('24. valid new character creation', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#ffd700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.newAssignments.length, 1);
    assert.deepEqual(result.newAssignments[0], {
        id: 'c1',
        name: 'Mara',
        color: '#FFD700',
    });
    assert.deepEqual(result.plannedState.assignments.c1, {
        name: 'Mara',
        color: '#FFD700',
    });
});

test('25. create name is trimmed/normalized', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: '   Mara Jade   ', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.newAssignments[0].name, 'Mara Jade');
    assert.equal(result.sourcePlans[0].name, 'Mara Jade');
});

test('26. create color normalized uppercase', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '  #ffd700  ' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.newAssignments[0].color, '#FFD700');
    assert.equal(result.sourcePlans[0].color, '#FFD700');
});

test('27. blank name rejected', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const badNames = ['', '   ', null, 123];

    for (const name of badNames) {
        const res = planLegacyMigration(chat, state, inventory, [
            { sourceKey: 'named:gold', action: 'create', name, color: '#FFD700' },
        ]);
        assert.equal(res.status, 'invalid-mappings');
        assert.deepEqual(res.errors, [
            { code: 'invalid-name', sourceKey: 'named:gold' },
        ]);
    }
});

test('28. malformed color rejected', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const badColors = ['#FFF', '#GGGGGG', 'gold', '123456', '', null];

    for (const color of badColors) {
        const res = planLegacyMigration(chat, state, inventory, [
            { sourceKey: 'named:gold', action: 'create', name: 'Mara', color },
        ]);
        assert.equal(res.status, 'invalid-mappings');
        assert.deepEqual(res.errors, [
            { code: 'invalid-color', sourceKey: 'named:gold' },
        ]);
    }
});

test('29. existing name collision rejected case-insensitively', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Mara', color: '#112233' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: '  mArA  ', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'invalid-mappings');
    assert.deepEqual(result.errors, [
        { code: 'name-already-assigned', sourceKey: 'named:gold' },
    ]);
});

test('30. duplicate colors across DIFFERENT new character names are allowed', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Mara speaks."</gold> <teal>"Alice speaks."</teal>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
        { sourceKey: 'named:teal', action: 'create', name: 'Alice', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.newAssignments.length, 2);
    assert.equal(result.newAssignments[0].name, 'Mara');
    assert.equal(result.newAssignments[0].color, '#FFD700');
    assert.equal(result.newAssignments[1].name, 'Alice');
    assert.equal(result.newAssignments[1].color, '#FFD700');
});

test('31. two source groups same folded name + same normalized color consolidate into one assignment', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"From gold."</gold> <font color="#E6B84A">"From hex."</font>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#ffd700' },
        { sourceKey: 'hex:#E6B84A', action: 'create', name: 'mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.newAssignments.length, 1);
    assert.equal(result.sourcePlans.length, 2);
    assert.equal(result.sourcePlans[0].assignmentId, result.sourcePlans[1].assignmentId);
    assert.equal(result.sourcePlans[0].name, 'Mara');
    assert.equal(result.sourcePlans[1].name, 'Mara');
});

test('32. consolidated sources share one allocated cN', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech 1."</gold> <font color="#E6B84A">"Speech 2."</font>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
        { sourceKey: 'hex:#E6B84A', action: 'create', name: 'Mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.newAssignments[0].id, 'c1');
    assert.equal(result.sourcePlans[0].assignmentId, 'c1');
    assert.equal(result.sourcePlans[1].assignmentId, 'c1');
    assert.equal(result.messageChanges[0].after, '[c1]Speech 1.[/c] [c1]Speech 2.[/c]');
});

test('33. first inventory-group spelling is preserved', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"First group."</gold> <teal>"Second group."</teal>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    assert.equal(inventory.groups[0].sourceKey, 'named:gold');
    assert.equal(inventory.groups[1].sourceKey, 'named:teal');

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:teal', action: 'create', name: 'mara jade', color: '#FFD700' },
        { sourceKey: 'named:gold', action: 'create', name: 'Mara Jade', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.newAssignments[0].name, 'Mara Jade');
    assert.equal(result.sourcePlans[0].name, 'Mara Jade');
    assert.equal(result.sourcePlans[1].name, 'Mara Jade');
});

test('34. same folded new name with different colors -> conflicting-new-character-color', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Gold."</gold> <teal>"Teal."</teal>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
        { sourceKey: 'named:teal', action: 'create', name: 'mara', color: '#008080' },
    ]);

    assert.equal(result.status, 'invalid-mappings');
    assert.deepEqual(result.errors, [
        { code: 'conflicting-new-character-color', sourceKey: 'named:teal' },
    ]);
});

test('35. unique-new-character capacity count is used rather than raw create-mapping count', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"First."</gold> <teal>"Second."</teal>' },
    ];
    const assignments = {};
    for (let i = 1; i <= 98; i += 1) {
        assignments[`c${i}`] = { name: `Char ${i}`, color: '#000000' };
    }
    const state = { schemaVersion: 1, assignments };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
        { sourceKey: 'named:teal', action: 'create', name: 'mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.newAssignments.length, 1);
    assert.equal(result.newAssignments[0].id, 'c99');
    assert.equal(result.stats.newAssignmentCount, 1);
});

test('36. first free cN gap is used', () => {
    const plannerSource = fs.readFileSync(
        new URL('../src/legacy-migration-planner.js', import.meta.url),
        'utf8',
    );
    assert.match(plannerSource, /\bgetNextFreeAssignmentId\b/);
    assert.match(plannerSource, /\bgetOrderedAssignmentEntries\b/);
    assert.doesNotMatch(plannerSource, /for\s*\(\s*let\s+i\s*=\s*1\s*;\s*i\s*<=\s*99/);
    assert.doesNotMatch(plannerSource, /Number\.parseInt\s*\(\s*[a-zA-Z0-9_.]+\.slice\(1\)/);

    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'One', color: '#111111' },
            c3: { name: 'Three', color: '#333333' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.newAssignments[0].id, 'c2');
});

test('37. multiple new characters fill free IDs deterministically by first source-group appearance', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"First."</gold> <teal>"Second."</teal>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'One', color: '#111111' },
            c3: { name: 'Three', color: '#333333' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
        { sourceKey: 'named:teal', action: 'create', name: 'Alice', color: '#008080' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.newAssignments.length, 2);
    assert.equal(result.newAssignments[0].id, 'c2');
    assert.equal(result.newAssignments[0].name, 'Mara');
    assert.equal(result.newAssignments[1].id, 'c4');
    assert.equal(result.newAssignments[1].name, 'Alice');
});

test('38. mapping-array order does not change allocation order', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"First in chat."</gold> <teal>"Second in chat."</teal>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    assert.equal(inventory.groups[0].sourceKey, 'named:gold');
    assert.equal(inventory.groups[1].sourceKey, 'named:teal');

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:teal', action: 'create', name: 'TealChar', color: '#008080' },
        { sourceKey: 'named:gold', action: 'create', name: 'GoldChar', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.newAssignments[0].id, 'c1');
    assert.equal(result.newAssignments[0].name, 'GoldChar');
    assert.equal(result.newAssignments[1].id, 'c2');
    assert.equal(result.newAssignments[1].name, 'TealChar');
});

test('39. full registry -> registry-capacity-exceeded', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const assignments = {};
    for (let i = 1; i <= 99; i += 1) {
        assignments[`c${i}`] = { name: `Char ${i}`, color: '#000000' };
    }
    const state = { schemaVersion: 1, assignments };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'invalid-mappings');
    assert.deepEqual(result.errors, [
        { code: 'registry-capacity-exceeded', sourceKey: null },
    ]);
});

test('40. plannedState preserves every existing assignment and adds only planned new ones', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Existing One', color: '#111111' },
            c5: { name: 'Existing Five', color: '#555555' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.deepEqual(result.plannedState, {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Existing One', color: '#111111' },
            c5: { name: 'Existing Five', color: '#555555' },
            c2: { name: 'Mara', color: '#FFD700' },
        },
    });
});

test('41. normal legacy dialogue -> [cN]content[/c]', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Plain speech."</gold>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.messageChanges[0].after, '[c1]Plain speech.[/c]');
    assert.equal(result.messageChanges[0].replacements[0].replacement, '[c1]Plain speech.[/c]');
});

test('42. measured/whisper/shout/tremble tone is preserved in [cN:tone]', () => {
    const chat = [
        { mes: 'Intro' },
        {
            is_user: true,
            mes: '<gold:whisper>"W"</gold:whisper> <gold:shout>"S"</gold:shout> <gold:measured>"M"</gold:measured> <gold:tremble>"T"</gold:tremble>',
        },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(
        result.messageChanges[0].after,
        '[c1:whisper]W[/c] [c1:shout]S[/c] [c1:measured]M[/c] [c1:tremble]T[/c]',
    );
});

test('43. no :normal is generated', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Untoned."</gold>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.messageChanges[0].after.includes(':normal'), false);
    assert.equal(result.messageChanges[0].replacements[0].replacement, '[c1]Untoned.[/c]');
});

test('44. Nemo external quotes disappear because scanner range/content is authoritative', () => {
    const chat = [
        { is_user: true, mes: 'Before "<font color="#56B4E9">Outside quotes.</font>" After' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'hex:#56B4E9', action: 'create', name: 'Alice', color: '#56B4E9' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.messageChanges[0].after, 'Before [c1]Outside quotes.[/c] After');
    assert.equal(result.messageChanges[0].replacements[0].raw, '"<font color="#56B4E9">Outside quotes.</font>"');
});

test('45. internal formatting is preserved byte-for-byte', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<font color="#56B4E9">"<i>Hello</i> <b>there</b>."</font>' },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'hex:#56B4E9', action: 'create', name: 'Alice', color: '#56B4E9' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(result.messageChanges[0].after, '[c1]<i>Hello</i> <b>there</b>.[/c]');
});

test('46. multiple mapped occurrences in one message rewrite correctly without offset corruption', () => {
    const chat = [
        { mes: 'Intro' },
        {
            is_user: true,
            mes: 'Start <gold>"One"</gold> Middle <teal>"Two"</teal> End <gold>"Three"</gold>',
        },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
        { sourceKey: 'named:teal', action: 'create', name: 'Alice', color: '#008080' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(
        result.messageChanges[0].after,
        'Start [c1]One[/c] Middle [c2]Two[/c] End [c1]Three[/c]',
    );
    assert.equal(result.messageChanges[0].replacements.length, 3);
});

test('47. skip + mapped occurrences in same message behave independently', () => {
    const chat = [
        { mes: 'Intro' },
        {
            is_user: true,
            mes: '<gold>"Skipped dialogue."</gold> and <teal>"Mapped dialogue."</teal>',
        },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'skip' },
        { sourceKey: 'named:teal', action: 'create', name: 'Alice', color: '#008080' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(
        result.messageChanges[0].after,
        '<gold>"Skipped dialogue."</gold> and [c1]Mapped dialogue.[/c]',
    );
    assert.equal(result.messageChanges[0].replacements.length, 1);
});

test('48. unknown-colored-content is never rewritten even when same source group is mapped', () => {
    const chat = [
        { mes: 'Intro' },
        {
            is_user: true,
            mes: '<gold>"Spoken line."</gold> and <gold>Unquoted colored remark.</gold>',
        },
    ];
    const state = { schemaVersion: 1, assignments: {} };
    const inventory = buildLegacyChatInventory(chat, state);

    assert.equal(inventory.groups[0].migratableCount, 1);
    assert.equal(inventory.groups[0].unknownColoredCount, 1);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(
        result.messageChanges[0].after,
        '[c1]Spoken line.[/c] and <gold>Unquoted colored remark.</gold>',
    );
    assert.equal(result.messageChanges[0].replacements.length, 1);
});

test('49. existing CD and scanner-issue regions remain untouched', () => {
    const chat = [
        { mes: 'Intro' },
        {
            is_user: true,
            mes: '[c1]Existing CD.[/c] <gold:badtone>"Unsupported tone."</gold:badtone> <gold>"Valid speech."</gold>',
        },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#000000' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    assert.equal(inventory.issues.length, 1);

    const result = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '#FFD700' },
    ]);

    assert.equal(result.status, 'ready');
    assert.equal(
        result.messageChanges[0].after,
        '[c1]Existing CD.[/c] <gold:badtone>"Unsupported tone."</gold:badtone> [c2]Valid speech.[/c]',
    );
});

test('50. messageChanges/replacements/stats/fresh-copy contracts are deterministic and exact', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold>"Speech 1."</gold>' },
        { mes: '<gold>"Speech 2."</gold>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c5: { name: 'Five', color: '#555555' },
        },
    };
    const inventory = buildLegacyChatInventory(chat, state);

    const result1 = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'reuse', assignmentId: 'c5' },
    ]);
    const result2 = planLegacyMigration(chat, state, inventory, [
        { sourceKey: 'named:gold', action: 'reuse', assignmentId: 'c5' },
    ]);

    assert.deepEqual(result1, result2);
    assert.notEqual(result1, result2);
    assert.notEqual(result1.messageChanges, result2.messageChanges);
    assert.notEqual(result1.plannedState, result2.plannedState);

    assert.equal(result1.messageChanges.length, 2);
    assert.equal(result1.messageChanges[0].messageIndex, 1);
    assert.equal(result1.messageChanges[1].messageIndex, 2);

    for (const change of result1.messageChanges) {
        assert.equal(change.after.includes('<!-- CD_NEW'), false);
        for (const rep of change.replacements) {
            assert.equal(rep.raw, change.before.slice(rep.range.start, rep.range.end));
        }
    }

    assert.deepEqual(result1.stats, {
        sourceGroupCount: 1,
        migratableSourceGroupCount: 1,
        mappedSourceGroupCount: 1,
        skippedSourceGroupCount: 0,
        newAssignmentCount: 0,
        reusedAssignmentCount: 1,
        changedMessageCount: 2,
        migratedOccurrenceCount: 2,
        skippedMigratableCount: 0,
        unknownColoredCount: 0,
        issueCount: 0,
    });

    result1.messageChanges[0].after = 'MUTATED';
    assert.notEqual(result2.messageChanges[0].after, 'MUTATED');
});