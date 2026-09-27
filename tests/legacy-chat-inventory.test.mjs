import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLegacyChatInventory } from '../src/legacy-chat-inventory.js';

test('1. non-array chat -> invalid-chat exact safe shape', () => {
    const invalidChats = [null, undefined, 42, 'chat', {}, true, Symbol('chat')];

    for (const input of invalidChats) {
        const result = buildLegacyChatInventory(input, { schemaVersion: 1, assignments: {} });
        assert.deepEqual(result, {
            status: 'invalid-chat',
            includeIntroduction: false,
            occurrences: [],
            groups: [],
            issues: [],
            skippedMessages: [],
            existingAssignments: [],
            stats: {
                messageCount: 0,
                scannedMessageCount: 0,
                skippedMessageCount: 0,
                occurrenceCount: 0,
                migratableCount: 0,
                unknownColoredCount: 0,
                issueCount: 0,
                sourceGroupCount: 0,
            },
        });
    }

    const withTrueOpt = buildLegacyChatInventory(null, {}, { includeIntroduction: true });
    assert.equal(withTrueOpt.status, 'invalid-chat');
    assert.equal(withTrueOpt.includeIntroduction, true);
});

test('2. empty valid chat -> ready empty inventory', () => {
    const state = { schemaVersion: 1, assignments: {} };
    const result = buildLegacyChatInventory([], state);

    assert.deepEqual(result, {
        status: 'ready',
        includeIntroduction: false,
        occurrences: [],
        groups: [],
        issues: [],
        skippedMessages: [],
        existingAssignments: [],
        stats: {
            messageCount: 0,
            scannedMessageCount: 0,
            skippedMessageCount: 0,
            occurrenceCount: 0,
            migratableCount: 0,
            unknownColoredCount: 0,
            issueCount: 0,
            sourceGroupCount: 0,
        },
    });
});

test('3. malformed/missing v1 state tolerates as empty assignments', () => {
    const invalidStates = [null, undefined, 123, 'corrupt', { assignments: 'invalid' }];

    for (const badState of invalidStates) {
        const chat = [
            { is_user: true, mes: '<gold>"Hello."</gold>' },
        ];
        const result = buildLegacyChatInventory(chat, badState);
        assert.equal(result.status, 'ready');
        assert.deepEqual(result.existingAssignments, []);
        assert.equal(result.occurrences.length, 1);
        assert.equal(result.groups.length, 1);
        assert.equal(result.groups[0].suggestedAssignmentId, null);
    }
});

test('4. explicit unsupported schema -> unsupported-state', () => {
    const chat = [
        { is_user: true, mes: '<gold>"Hello."</gold>' },
        { mes: 'Assistant reply.' },
    ];
    const unsupportedState = {
        schemaVersion: 999,
        assignments: {
            c1: { name: 'Alice', color: '#FFD700' },
        },
    };

    const result = buildLegacyChatInventory(chat, unsupportedState);
    assert.deepEqual(result, {
        status: 'unsupported-state',
        includeIntroduction: false,
        occurrences: [],
        groups: [],
        issues: [],
        skippedMessages: [],
        existingAssignments: [],
        stats: {
            messageCount: 2,
            scannedMessageCount: 0,
            skippedMessageCount: 0,
            occurrenceCount: 0,
            migratableCount: 0,
            unknownColoredCount: 0,
            issueCount: 0,
            sourceGroupCount: 0,
        },
    });
});

test('5. options includeIntroduction resolves true only for literal true', () => {
    const falsyOptionValues = [
        undefined,
        null,
        false,
        0,
        1,
        '',
        'true',
        {},
        [],
        () => {},
    ];

    for (const val of falsyOptionValues) {
        const res = buildLegacyChatInventory([], {}, { includeIntroduction: val });
        assert.equal(res.includeIntroduction, false);
    }

    const resDefault = buildLegacyChatInventory([], {});
    assert.equal(resDefault.includeIntroduction, false);

    const resTrue = buildLegacyChatInventory([], {}, { includeIntroduction: true });
    assert.equal(resTrue.includeIntroduction, true);
});

test('6. function never mutates chat input', () => {
    const chat = [
        { mes: 'Intro greeting' },
        { is_user: true, mes: '<gold>"Speech."</gold>' },
    ];
    const snapshot = JSON.parse(JSON.stringify(chat));

    buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });
    assert.deepEqual(chat, snapshot);
});

test('7. function never mutates state input', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#FFD700' },
        },
    };
    const snapshot = JSON.parse(JSON.stringify(state));

    buildLegacyChatInventory([], state);
    assert.deepEqual(state, snapshot);
});

test('8. repeated calls return fresh detached structures', () => {
    const chat = [
        { is_user: true, mes: '<gold>"First."</gold>' },
    ];
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#FFD700' },
        },
    };

    const first = buildLegacyChatInventory(chat, state);
    const second = buildLegacyChatInventory(chat, state);

    assert.notEqual(first, second);
    assert.notEqual(first.occurrences, second.occurrences);
    assert.notEqual(first.groups, second.groups);
    assert.notEqual(first.existingAssignments, second.existingAssignments);
    assert.notEqual(first.stats, second.stats);

    first.occurrences[0].content = 'mutated';
    first.existingAssignments[0].name = 'Mutated';
    first.groups[0].sourceKey = 'mutated';

    assert.equal(second.occurrences[0].content, 'First.');
    assert.equal(second.existingAssignments[0].name, 'Alice');
    assert.equal(second.groups[0].sourceKey, 'named:gold');
});

test('9. assistant index 0 is skipped by default', () => {
    const chat = [
        { mes: '<gold>"Hello from greeting."</gold>' },
        { is_user: true, mes: '<teal>"User message."</teal>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.status, 'ready');
    assert.equal(result.skippedMessages.length, 1);
    assert.equal(result.skippedMessages[0].messageIndex, 0);
    assert.equal(result.occurrences.length, 1);
    assert.equal(result.occurrences[0].sourceKey, 'named:teal');
    assert.equal(result.stats.scannedMessageCount, 1);
    assert.equal(result.stats.skippedMessageCount, 1);
});

test('10. skipped intro receives exact intro-message reason', () => {
    const chat = [
        { mes: 'Greeting message' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.deepEqual(result.skippedMessages, [
        {
            messageIndex: 0,
            role: 'assistant',
            reason: 'intro-message',
        },
    ]);
});

test('11. decorative nested DIV + DEM-like color in intro is never inventoried by default', () => {
    const decorativeIntro = [
        '<div class="fancy-card">',
        '  <span style="color:#56B4E9">"Decorative quote"</span>',
        '</div>',
    ].join('\n');

    const chat = [
        { mes: decorativeIntro },
        { mes: '<font color="#56B4E9">"Real dialogue."</font>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.occurrences.length, 1);
    assert.equal(result.occurrences[0].messageIndex, 1);
    assert.equal(result.occurrences[0].content, 'Real dialogue.');
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].occurrenceCount, 1);
    assert.deepEqual(result.groups[0].messageIndexes, [1]);
});

test('12. FF/HTML legacy markup in intro is also completely ignored by default', () => {
    const introWithAllAdapters = '<gold>"Intro FF."</gold> <font color="#56B4E9">"Intro HTML."</font>';
    const chat = [
        { mes: introWithAllAdapters },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.occurrences.length, 0);
    assert.equal(result.groups.length, 0);
    assert.equal(result.issues.length, 0);
    assert.equal(result.stats.scannedMessageCount, 0);
    assert.equal(result.stats.skippedMessageCount, 1);
});

test('13. includeIntroduction=true scans assistant index 0', () => {
    const chat = [
        { mes: '<gold>"Greeting speech."</gold>' },
    ];

    const result = buildLegacyChatInventory(
        chat,
        { schemaVersion: 1, assignments: {} },
        { includeIntroduction: true },
    );

    assert.equal(result.status, 'ready');
    assert.equal(result.includeIntroduction, true);
    assert.equal(result.skippedMessages.length, 0);
    assert.equal(result.occurrences.length, 1);
    assert.equal(result.occurrences[0].messageIndex, 0);
    assert.equal(result.occurrences[0].role, 'assistant');
    assert.equal(result.occurrences[0].content, 'Greeting speech.');
    assert.equal(result.stats.scannedMessageCount, 1);
    assert.equal(result.stats.skippedMessageCount, 0);
});

test('14. index 0 USER message is not treated as intro', () => {
    const chat = [
        { is_user: true, mes: '<gold>"User dialogue at index 0."</gold>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.skippedMessages.length, 0);
    assert.equal(result.occurrences.length, 1);
    assert.equal(result.occurrences[0].messageIndex, 0);
    assert.equal(result.occurrences[0].role, 'user');
    assert.equal(result.occurrences[0].content, 'User dialogue at index 0.');
    assert.equal(result.stats.scannedMessageCount, 1);
    assert.equal(result.stats.skippedMessageCount, 0);
});

test('15. first assistant message at index >0 is NOT skipped merely for being first assistant', () => {
    const chat = [
        { is_user: true, mes: 'User starts the chat.' },
        { mes: '<gold>"First assistant message at index 1."</gold>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.skippedMessages.length, 0);
    assert.equal(result.occurrences.length, 1);
    const occ = result.occurrences[0];
    assert.equal(occ.messageIndex, 1);
    assert.equal(occ.role, 'assistant');
    assert.equal(occ.content, 'First assistant message at index 1.');
    assert.equal(result.stats.scannedMessageCount, 2);
});

test('16. intro skip does not prevent later real legacy dialogue from being inventoried', () => {
    const chat = [
        { mes: '<gold>"Greeting markup."</gold>' },
        { is_user: true, mes: '<teal>"User query."</teal>' },
        { mes: '<cyan>"Assistant follow-up."</cyan>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.skippedMessages.length, 1);
    assert.equal(result.skippedMessages[0].messageIndex, 0);
    assert.equal(result.occurrences.length, 2);
    assert.equal(result.occurrences[0].messageIndex, 1);
    assert.equal(result.occurrences[0].role, 'user');
    assert.equal(result.occurrences[0].sourceKey, 'named:teal');
    assert.equal(result.occurrences[1].messageIndex, 2);
    assert.equal(result.occurrences[1].role, 'assistant');
    assert.equal(result.occurrences[1].sourceKey, 'named:cyan');
});

test('17. user legacy dialogue is scanned with role=user', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<font color="#56B4E9">"User speech."</font>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.occurrences.length, 1);
    assert.equal(result.occurrences[0].role, 'user');
    assert.equal(result.occurrences[0].messageIndex, 1);
});

test('18. assistant dialogue is scanned with role=assistant', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: false, is_system: false, mes: '<font color="#56B4E9">"Assistant speech."</font>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.occurrences.length, 1);
    assert.equal(result.occurrences[0].role, 'assistant');
    assert.equal(result.occurrences[0].messageIndex, 1);
});

test('19. system message is skipped even when it contains valid legacy markup', () => {
    const chat = [
        { is_system: true, mes: '<gold>"System prompt with color."</gold>' },
        { is_user: true, mes: '<gold>"User valid speech."</gold>' },
        { is_system: true, is_user: true, mes: '<teal>"Another system message."</teal>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.skippedMessages.length, 2);
    assert.deepEqual(result.skippedMessages[0], {
        messageIndex: 0,
        role: 'system',
        reason: 'system-message',
    });
    assert.deepEqual(result.skippedMessages[1], {
        messageIndex: 2,
        role: 'system',
        reason: 'system-message',
    });

    assert.equal(result.occurrences.length, 1);
    assert.equal(result.occurrences[0].messageIndex, 1);
    assert.equal(result.occurrences[0].role, 'user');
});

test('20. malformed non-object entry -> invalid-message / role null', () => {
    const chat = [
        null,
        42,
        'just a string',
        [],
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.skippedMessages.length, 4);
    for (let i = 0; i < 4; i += 1) {
        assert.deepEqual(result.skippedMessages[i], {
            messageIndex: i,
            role: null,
            reason: 'invalid-message',
        });
    }
    assert.equal(result.stats.scannedMessageCount, 0);
    assert.equal(result.stats.skippedMessageCount, 4);
});

test('21. object with non-string mes -> invalid-message with identifiable role', () => {
    const chat = [
        { mes: 123 },
        { is_user: true, mes: null },
        { is_user: false, mes: undefined },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.skippedMessages.length, 3);
    assert.deepEqual(result.skippedMessages[0], {
        messageIndex: 0,
        role: 'assistant',
        reason: 'invalid-message',
    });
    assert.deepEqual(result.skippedMessages[1], {
        messageIndex: 1,
        role: 'user',
        reason: 'invalid-message',
    });
    assert.deepEqual(result.skippedMessages[2], {
        messageIndex: 2,
        role: 'assistant',
        reason: 'invalid-message',
    });
});

test('22. scanned/skipped message counts are exact', () => {
    const chat = [
        { mes: 'Intro skipped' },
        { is_user: true, mes: 'User message 1' },
        { is_system: true, mes: 'System skipped' },
        null,
        { mes: 'Assistant message 4' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.stats.messageCount, 5);
    assert.equal(result.stats.scannedMessageCount, 2);
    assert.equal(result.stats.skippedMessageCount, 3);
    assert.equal(result.skippedMessages.length, 3);
});

test('23. FF occurrence carries messageIndex and role while preserving scanner fields', () => {
    const chat = [
        { mes: 'Greeting' },
        { is_user: true, mes: 'Prefix <gold:whisper>"Quiet speech."</gold:whisper> suffix' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.occurrences.length, 1);
    const occ = result.occurrences[0];
    assert.equal(occ.messageIndex, 1);
    assert.equal(occ.role, 'user');
    assert.equal(occ.adapter, 'ff-named-color');
    assert.equal(occ.sourceType, 'named');
    assert.equal(occ.sourceValue, 'gold');
    assert.equal(occ.sourceKey, 'named:gold');
    assert.equal(occ.tone, 'whisper');
    assert.equal(occ.classification, 'spoken');
    assert.equal(occ.migratable, true);
    assert.equal(occ.content, 'Quiet speech.');
    assert.equal(occ.quoteStyle, 'straight-double');
    assert.equal(occ.raw, '<gold:whisper>"Quiet speech."</gold:whisper>');
    assert.equal(occ.range.start, 7);
    assert.equal(occ.range.end, 7 + occ.raw.length);
});

test('24. HTML occurrence preserves exact local raw/range', () => {
    const chat = [
        { is_user: true, mes: 'Before "<font color="#56B4E9">Outside quotes.</font>" After' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.occurrences.length, 1);
    const occ = result.occurrences[0];
    assert.equal(occ.messageIndex, 0);
    assert.equal(occ.role, 'user');
    assert.equal(occ.adapter, 'html-font-color');
    assert.equal(occ.sourceType, 'hex');
    assert.equal(occ.sourceValue, '#56B4E9');
    assert.equal(occ.sourceKey, 'hex:#56B4E9');
    assert.equal(occ.content, 'Outside quotes.');
    assert.equal(occ.raw, '"<font color="#56B4E9">Outside quotes.</font>"');
    assert.equal(occ.range.start, 7);
    assert.equal(occ.range.end, 7 + occ.raw.length);
});

test('25. DEM occurrence preserves exact local raw/range', () => {
    const chat = [
        { mes: 'Intro' },
        { mes: 'Saying <span style="color:#56B4E9">"Inside DEM span."</span> now' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.occurrences.length, 1);
    const occ = result.occurrences[0];
    assert.equal(occ.messageIndex, 1);
    assert.equal(occ.role, 'assistant');
    assert.equal(occ.adapter, 'inline-css-color');
    assert.equal(occ.sourceType, 'hex');
    assert.equal(occ.sourceValue, '#56B4E9');
    assert.equal(occ.content, 'Inside DEM span.');
    assert.equal(occ.raw, '<span style="color:#56B4E9">"Inside DEM span."</span>');
    assert.equal(occ.range.start, 7);
    assert.equal(occ.range.end, 7 + occ.raw.length);
});

test('26. scanner unsupported-tone issue receives messageIndex/role', () => {
    const chat = [
        { mes: 'Intro' },
        { is_user: true, mes: '<gold:shouting>"Bad tone."</gold:shouting>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.occurrences.length, 0);
    assert.equal(result.issues.length, 1);
    const issue = result.issues[0];
    assert.equal(issue.messageIndex, 1);
    assert.equal(issue.role, 'user');
    assert.equal(issue.code, 'unsupported-tone');
    assert.equal(issue.adapter, 'ff-named-color');
    assert.equal(issue.raw, '<gold:shouting>"Bad tone."</gold:shouting>');
    assert.equal(issue.range.start, 0);
    assert.equal(issue.range.end, '<gold:shouting>"Bad tone."</gold:shouting>'.length);
});

test('27. existing-CD overlap issue is preserved', () => {
    const chat = [
        { is_user: true, mes: '[c1]<font color="#56B4E9">"Nested speech inside CD."</font>[/c]' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.occurrences.length, 0);
    assert.equal(result.issues.length, 1);
    const issue = result.issues[0];
    assert.equal(issue.messageIndex, 0);
    assert.equal(issue.role, 'user');
    assert.equal(issue.code, 'overlaps-existing-cd');
    assert.equal(issue.adapter, 'html-font-color');
});

test('28. occurrence ordering across multiple messages is deterministic', () => {
    const chat = [
        { is_user: true, mes: '<gold>"First in msg 0."</gold> and <teal>"Second in msg 0."</teal>' },
        { mes: '<gold>"First in msg 1."</gold>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.occurrences.length, 3);
    assert.equal(result.occurrences[0].messageIndex, 0);
    assert.equal(result.occurrences[0].content, 'First in msg 0.');
    assert.equal(result.occurrences[1].messageIndex, 0);
    assert.equal(result.occurrences[1].content, 'Second in msg 0.');
    assert.equal(result.occurrences[2].messageIndex, 1);
    assert.equal(result.occurrences[2].content, 'First in msg 1.');
});

test('29. issue ordering across multiple messages is deterministic', () => {
    const chat = [
        { is_user: true, mes: '<gold:badtone>"Issue msg 0."</gold:badtone>' },
        { mes: '<teal:badtone>"Issue msg 1."</teal:badtone>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.issues.length, 2);
    assert.equal(result.issues[0].messageIndex, 0);
    assert.equal(result.issues[0].adapter, 'ff-named-color');
    assert.equal(result.issues[1].messageIndex, 1);
    assert.equal(result.issues[1].adapter, 'ff-named-color');
});

test('30. same HEX across HTML Font and DEM produces one source group', () => {
    const chat = [
        { is_user: true, mes: '<font color="#56B4E9">"From font."</font>' },
        { mes: '<span style="color:#56B4E9">"From span."</span>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.groups.length, 1);
    const grp = result.groups[0];
    assert.equal(grp.sourceKey, 'hex:#56B4E9');
    assert.equal(grp.sourceType, 'hex');
    assert.equal(grp.sourceValue, '#56B4E9');
    assert.equal(grp.occurrenceCount, 2);
    assert.deepEqual(grp.adapters, ['html-font-color', 'inline-css-color']);
    assert.deepEqual(grp.messageIndexes, [0, 1]);
});

test('31. different HEX values produce separate groups', () => {
    const chat = [
        { is_user: true, mes: '<font color="#56B4E9">"Blue."</font> <font color="#E69F00">"Orange."</font>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.groups.length, 2);
    assert.equal(result.groups[0].sourceKey, 'hex:#56B4E9');
    assert.equal(result.groups[1].sourceKey, 'hex:#E69F00');
});

test('32. named:gold and hex:#FFD700 remain separate source groups despite sharing the same suggestedFinalColor', () => {
    const chat = [
        { is_user: true, mes: '<gold>"Gold FF."</gold> <font color="#FFD700">"Gold HEX."</font>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.groups.length, 2);
    assert.equal(result.groups[0].sourceKey, 'named:gold');
    assert.equal(result.groups[0].sourceType, 'named');
    assert.equal(result.groups[0].sourceValue, 'gold');
    assert.equal(result.groups[0].suggestedFinalColor, '#FFD700');

    assert.equal(result.groups[1].sourceKey, 'hex:#FFD700');
    assert.equal(result.groups[1].sourceType, 'hex');
    assert.equal(result.groups[1].sourceValue, '#FFD700');
    assert.equal(result.groups[1].suggestedFinalColor, '#FFD700');
});

test('33. group counts migratable vs unknown-colored correctly', () => {
    const chat = [
        { is_user: true, mes: '<gold>"Quoted one."</gold> and <gold>Unquoted colored remark.</gold> and <gold>"Quoted two."</gold>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.groups.length, 1);
    const grp = result.groups[0];
    assert.equal(grp.occurrenceCount, 3);
    assert.equal(grp.migratableCount, 2);
    assert.equal(grp.unknownColoredCount, 1);

    assert.equal(result.stats.occurrenceCount, 3);
    assert.equal(result.stats.migratableCount, 2);
    assert.equal(result.stats.unknownColoredCount, 1);
});

test('34. adapters preserve unique first-seen order', () => {
    const chat = [
        { is_user: true, mes: '<span style="color:#56B4E9">"First DEM."</span> and <font color="#56B4E9">"Second Font."</font> and <span style="color:#56B4E9">"Third DEM."</span>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.groups.length, 1);
    assert.deepEqual(result.groups[0].adapters, ['inline-css-color', 'html-font-color']);
});

test('35. messageIndexes are unique numeric ascending', () => {
    const chat = [
        { is_user: true, mes: '<gold>"Msg 0 first."</gold> <gold>"Msg 0 second."</gold>' },
        { mes: '<teal>"Other color."</teal>' },
        { mes: '<gold>"Msg 2."</gold>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    const goldGroup = result.groups.find((g) => g.sourceKey === 'named:gold');
    assert.ok(goldGroup);
    assert.deepEqual(goldGroup.messageIndexes, [0, 2]);
});

test('36. samples contain first three occurrences only with exact sample shape', () => {
    const chat = [
        { is_user: true, mes: '<gold:whisper>"One"</gold:whisper> <gold>"Two"</gold> <gold:shout>"Three"</gold:shout> <gold>"Four"</gold>' },
    ];

    const result = buildLegacyChatInventory(chat, { schemaVersion: 1, assignments: {} });

    assert.equal(result.groups.length, 1);
    const grp = result.groups[0];
    assert.equal(grp.occurrenceCount, 4);
    assert.equal(grp.samples.length, 3);

    const expectedSampleKeys = ['classification', 'content', 'messageIndex', 'role', 'tone'];

    for (const sample of grp.samples) {
        assert.deepEqual(Object.keys(sample).sort(), expectedSampleKeys);
    }

    assert.deepEqual(grp.samples[0], {
        messageIndex: 0,
        role: 'user',
        content: 'One',
        tone: 'whisper',
        classification: 'spoken',
    });
    assert.deepEqual(grp.samples[1], {
        messageIndex: 0,
        role: 'user',
        content: 'Two',
        tone: null,
        classification: 'spoken',
    });
    assert.deepEqual(grp.samples[2], {
        messageIndex: 0,
        role: 'user',
        content: 'Three',
        tone: 'shout',
        classification: 'spoken',
    });
});

test('37. existingAssignments returned detached in numeric cN order', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c10: { name: 'Ten', color: '#101010' },
            c2: { name: 'Two', color: '#020202' },
            c1: { name: 'One', color: '#010101' },
        },
    };

    const result = buildLegacyChatInventory([], state);

    assert.deepEqual(result.existingAssignments, [
        { id: 'c1', name: 'One', color: '#010101' },
        { id: 'c2', name: 'Two', color: '#020202' },
        { id: 'c10', name: 'Ten', color: '#101010' },
    ]);

    result.existingAssignments[0].name = 'Mutated';
    assert.equal(state.assignments.c1.name, 'One');
});

test('38. one exact HEX assignment match produces suggestedAssignmentId', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#E69F00' },
            c3: { name: 'Mara', color: '#56B4E9' },
        },
    };

    const chat = [
        { is_user: true, mes: '<font color="#56B4E9">"Matched color."</font>' },
    ];

    const result = buildLegacyChatInventory(chat, state);

    assert.equal(result.groups.length, 1);
    const grp = result.groups[0];
    assert.deepEqual(grp.existingColorMatches, [
        { id: 'c3', name: 'Mara', color: '#56B4E9' },
    ]);
    assert.equal(grp.suggestedAssignmentId, 'c3');
});

test('39. duplicate existing assignment colors produce multiple matches and no suggestion', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#56B4E9' },
            c2: { name: 'Bob', color: '#56B4E9' },
        },
    };

    const chat = [
        { is_user: true, mes: '<font color="#56B4E9">"Ambiguous color."</font>' },
    ];

    const result = buildLegacyChatInventory(chat, state);

    assert.equal(result.groups.length, 1);
    const grp = result.groups[0];
    assert.equal(grp.existingColorMatches.length, 2);
    assert.deepEqual(grp.existingColorMatches, [
        { id: 'c1', name: 'Alice', color: '#56B4E9' },
        { id: 'c2', name: 'Bob', color: '#56B4E9' },
    ]);
    assert.equal(grp.suggestedAssignmentId, null);
});

test('40. FF named source retains named:* identity while receiving the exact standardized CSS suggestedFinalColor; a unique existing assignment with that exact derived hex may be suggested, while duplicate matches remain ambiguous', () => {
    const expectedStandardizedPalette = {
        cyan: '#00FFFF',
        pink: '#FFC0CB',
        teal: '#008080',
        orange: '#FFA500',
        gold: '#FFD700',
        violet: '#EE82EE',
        salmon: '#FA8072',
        orchid: '#DA70D6',
        yellow: '#FFFF00',
        plum: '#DDA0DD',
    };

    for (const [colorName, expectedHex] of Object.entries(expectedStandardizedPalette)) {
        const singleChat = [{ is_user: true, mes: `<${colorName}>"Test."</${colorName}>` }];
        const res = buildLegacyChatInventory(singleChat, { schemaVersion: 1, assignments: {} });
        assert.equal(res.groups.length, 1);
        const g = res.groups[0];
        assert.equal(g.sourceKey, `named:${colorName}`);
        assert.equal(g.sourceType, 'named');
        assert.equal(g.sourceValue, colorName);
        assert.equal(g.suggestedFinalColor, expectedHex);
    }

    const uniqueState = {
        schemaVersion: 1,
        assignments: {
            c3: { name: 'Mara', color: '#FFD700' },
            c5: { name: 'Nemo', color: '#00FFFF' },
        },
    };

    const chatWithGoldAndCyan = [
        { is_user: true, mes: '<gold>"Gold dialogue."</gold> and <cyan>"Cyan dialogue."</cyan>' },
    ];

    const uniqueResult = buildLegacyChatInventory(chatWithGoldAndCyan, uniqueState);

    assert.equal(uniqueResult.groups.length, 2);

    const goldGroup = uniqueResult.groups.find((g) => g.sourceKey === 'named:gold');
    assert.ok(goldGroup);
    assert.equal(goldGroup.sourceKey, 'named:gold');
    assert.notEqual(goldGroup.sourceKey, 'hex:#FFD700');
    assert.equal(goldGroup.sourceType, 'named');
    assert.equal(goldGroup.sourceValue, 'gold');
    assert.equal(goldGroup.suggestedFinalColor, '#FFD700');
    assert.deepEqual(goldGroup.existingColorMatches, [
        { id: 'c3', name: 'Mara', color: '#FFD700' },
    ]);
    assert.equal(goldGroup.suggestedAssignmentId, 'c3');

    const cyanGroup = uniqueResult.groups.find((g) => g.sourceKey === 'named:cyan');
    assert.ok(cyanGroup);
    assert.equal(cyanGroup.sourceKey, 'named:cyan');
    assert.notEqual(cyanGroup.sourceKey, 'hex:#00FFFF');
    assert.equal(cyanGroup.sourceType, 'named');
    assert.equal(cyanGroup.sourceValue, 'cyan');
    assert.equal(cyanGroup.suggestedFinalColor, '#00FFFF');
    assert.deepEqual(cyanGroup.existingColorMatches, [
        { id: 'c5', name: 'Nemo', color: '#00FFFF' },
    ]);
    assert.equal(cyanGroup.suggestedAssignmentId, 'c5');

    const ambiguousState = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#FFD700' },
            c3: { name: 'Mara', color: '#FFD700' },
        },
    };

    const ambiguousResult = buildLegacyChatInventory(chatWithGoldAndCyan, ambiguousState);
    const ambiguousGoldGroup = ambiguousResult.groups.find((g) => g.sourceKey === 'named:gold');
    assert.ok(ambiguousGoldGroup);
    assert.equal(ambiguousGoldGroup.existingColorMatches.length, 2);
    assert.deepEqual(ambiguousGoldGroup.existingColorMatches, [
        { id: 'c1', name: 'Alice', color: '#FFD700' },
        { id: 'c3', name: 'Mara', color: '#FFD700' },
    ]);
    assert.equal(ambiguousGoldGroup.suggestedAssignmentId, null);
});