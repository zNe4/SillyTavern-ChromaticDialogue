// tests/registry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState } from '../src/domain.js';
import {
    buildCompactRegistryState,
    buildCompactRoster,
    getAssignmentCount,
    getNextFreeAssignmentId,
    getOrderedAssignmentEntries,
} from '../src/registry.js';

test('1. empty registry returns zero count, empty list, and c1 next ID', () => {
    const state = createEmptyState();

    assert.equal(getAssignmentCount(state), 0);
    assert.deepEqual(getOrderedAssignmentEntries(state), []);
    assert.equal(getNextFreeAssignmentId(state), 'c1');
    assert.equal(buildCompactRoster(state), '');
    assert.equal(
        buildCompactRegistryState(state),
        'count=0; roster=; next=c1',
    );
});

test('2. count with several assignments returns valid total', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
            c3: { name: 'Maria', color: '#E69F00' },
            c12: { name: 'Julian', color: '#009E73' },
        },
    };

    assert.equal(getAssignmentCount(state), 3);
});

test('3. numeric ordering sorts by ID number rather than lexicographically', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c10: { name: 'Ten', color: '#101010' },
            c1: { name: 'One', color: '#010101' },
            c11: { name: 'Eleven', color: '#111111' },
            c2: { name: 'Two', color: '#020202' },
            c9: { name: 'Nine', color: '#090909' },
        },
    };

    const entries = getOrderedAssignmentEntries(state);
    const orderedIds = entries.map(([id]) => id);

    assert.deepEqual(orderedIds, ['c1', 'c2', 'c9', 'c10', 'c11']);
    assert.deepEqual(entries, [
        ['c1', { name: 'One', color: '#010101' }],
        ['c2', { name: 'Two', color: '#020202' }],
        ['c9', { name: 'Nine', color: '#090909' }],
        ['c10', { name: 'Ten', color: '#101010' }],
        ['c11', { name: 'Eleven', color: '#111111' }],
    ]);
});

test('4. gap reuse returns c2 when c1 and c3 exist', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
            c3: { name: 'Maria', color: '#E69F00' },
        },
    };

    assert.equal(getNextFreeAssignmentId(state), 'c2');
});

test('5. gap reuse finds lowest available ID in larger sequences', () => {
    const stateWithMiddleGap = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'One', color: '#010101' },
            c2: { name: 'Two', color: '#020202' },
            c4: { name: 'Four', color: '#040404' },
            c5: { name: 'Five', color: '#050505' },
            c6: { name: 'Six', color: '#060606' },
        },
    };
    assert.equal(getNextFreeAssignmentId(stateWithMiddleGap), 'c3');

    const stateWithStartGap = {
        schemaVersion: 1,
        assignments: {
            c2: { name: 'Two', color: '#020202' },
            c3: { name: 'Three', color: '#030303' },
            c4: { name: 'Four', color: '#040404' },
        },
    };
    assert.equal(getNextFreeAssignmentId(stateWithStartGap), 'c1');
});

test('6. c99 boundary resolves next ID correctly', () => {
    const assignments = {};
    for (let i = 1; i <= 98; i += 1) {
        assignments[`c${i}`] = {
            name: `Character ${i}`,
            color: '#123456',
        };
    }
    const stateAt98 = {
        schemaVersion: 1,
        assignments,
    };

    assert.equal(getNextFreeAssignmentId(stateAt98), 'c99');

    const stateWithOnly99 = {
        schemaVersion: 1,
        assignments: {
            c99: { name: 'Ninety-Nine', color: '#999999' },
        },
    };
    assert.equal(getNextFreeAssignmentId(stateWithOnly99), 'c1');

    const stateMissing98 = {
        schemaVersion: 1,
        assignments: {
            ...assignments,
            c99: { name: 'Ninety-Nine', color: '#999999' },
        },
    };
    delete stateMissing98.assignments.c98;
    assert.equal(getNextFreeAssignmentId(stateMissing98), 'c98');
});

test('7. all 99 IDs occupied yields null next ID and next=none', () => {
    const assignments = {};
    for (let i = 1; i <= 99; i += 1) {
        assignments[`c${i}`] = {
            name: `Char${i}`,
            color: '#123456',
        };
    }
    const fullState = {
        schemaVersion: 1,
        assignments,
    };

    assert.equal(getAssignmentCount(fullState), 99);
    assert.equal(getNextFreeAssignmentId(fullState), null);

    const compact = buildCompactRegistryState(fullState);
    assert.equal(compact.startsWith('count=99; roster='), true);
    assert.equal(compact.endsWith('; next=none'), true);
});

test('8. compact roster exact formatting uses semicolon separator without colors', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
            c3: { name: 'Maria', color: '#E69F00' },
        },
    };

    assert.equal(buildCompactRoster(state), 'c1=Catherine; c3=Maria');

    const singleState = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
        },
    };

    assert.equal(buildCompactRoster(singleState), 'c1=Catherine');
    assert.equal(buildCompactRoster(createEmptyState()), '');
});

test('9. compact registry state exact formatting matches prompt tokens structure', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
            c3: { name: 'Maria', color: '#E69F00' },
        },
    };

    assert.equal(
        buildCompactRegistryState(state),
        'count=2; roster=c1=Catherine,c3=Maria; next=c2',
    );
});

test('10. empty compact registry formatting matches expected defaults', () => {
    assert.equal(
        buildCompactRegistryState(createEmptyState()),
        'count=0; roster=; next=c1',
    );
    assert.equal(
        buildCompactRegistryState({ schemaVersion: 1, assignments: {} }),
        'count=0; roster=; next=c1',
    );
});

test('11. invalid outer input fails safely as an empty registry', () => {
    const invalidInputs = [
        undefined,
        null,
        false,
        42,
        'invalid',
        [],
        {},
        { assignments: null },
        { assignments: [] },
        { assignments: 'malformed' },
        { schemaVersion: 2, assignments: {} },
    ];

    for (const input of invalidInputs) {
        assert.equal(getAssignmentCount(input), 0);
        assert.deepEqual(getOrderedAssignmentEntries(input), []);
        assert.equal(getNextFreeAssignmentId(input), 'c1');
        assert.equal(buildCompactRoster(input), '');
        assert.equal(
            buildCompactRegistryState(input),
            'count=0; roster=; next=c1',
        );
    }
});

test('12. returned ordered entries cannot be used to mutate source assignment data', () => {
    const sourceState = {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: 'Catherine',
                color: '#56B4E9',
            },
            c3: {
                name: 'Maria',
                color: '#E69F00',
            },
        },
    };

    const entries = getOrderedAssignmentEntries(sourceState);

    entries[0][1].name = 'Mutated Catherine';
    entries[0][1].color = '#000000';
    entries[0][0] = 'c99';
    entries.push(['c2', { name: 'Injected', color: '#112233' }]);

    assert.equal(sourceState.assignments.c1.name, 'Catherine');
    assert.equal(sourceState.assignments.c1.color, '#56B4E9');
    assert.equal(sourceState.assignments.c3.name, 'Maria');
    assert.equal(sourceState.assignments.c3.color, '#E69F00');
    assert.equal(sourceState.assignments.c2, undefined);
    assert.equal(sourceState.assignments.c99, undefined);
    assert.deepEqual(Object.keys(sourceState.assignments), ['c1', 'c3']);
});

test('13. invalid assignment IDs are not treated as occupied', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            ' C1 ': { name: 'Padded', color: '#111111' },
            'c0': { name: 'Zero', color: '#222222' },
            'c01': { name: 'LeadingZero', color: '#333333' },
            'c100': { name: 'TooHigh', color: '#444444' },
            'C2': { name: 'Upper', color: '#555555' },
            'invalid': { name: 'BadKey', color: '#666666' },
            '1': { name: 'NumberOnly', color: '#777777' },
            c3: { name: 'Maria', color: '#E69F00' },
        },
    };

    assert.equal(getAssignmentCount(state), 1);
    assert.deepEqual(getOrderedAssignmentEntries(state), [
        ['c3', { name: 'Maria', color: '#E69F00' }],
    ]);
    assert.equal(getNextFreeAssignmentId(state), 'c1');
    assert.equal(buildCompactRoster(state), 'c3=Maria');
    assert.equal(
        buildCompactRegistryState(state),
        'count=1; roster=c3=Maria; next=c1',
    );
});

test('malformed assignment values are excluded from query results', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: null,
            c2: { name: '   ', color: '#111111' },
            c3: { name: 'Valid', color: 'invalid-hex' },
            c4: { name: 'Valid Four', color: '#444444' },
            c5: 12345,
        },
    };

    assert.equal(getAssignmentCount(state), 1);
    assert.deepEqual(getOrderedAssignmentEntries(state), [
        ['c4', { name: 'Valid Four', color: '#444444' }],
    ]);
    assert.equal(getNextFreeAssignmentId(state), 'c1');
});

test('commas in names are escaped in compact representations', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Dr. Smith, Jr.', color: '#111111' },
            c2: { name: 'Doe, Jane, III', color: '#222222' },
        },
    };

    assert.equal(
        buildCompactRoster(state),
        'c1=Dr. Smith\\, Jr.; c2=Doe\\, Jane\\, III',
    );
    assert.equal(
        buildCompactRegistryState(state),
        'count=2; roster=c1=Dr. Smith\\, Jr.,c2=Doe\\, Jane\\, III; next=c3',
    );
});

test('semicolons and equals signs in names are escaped', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Mara; next=c99', color: '#111111' },
            c2: { name: 'A=B; C=D', color: '#222222' },
        },
    };

    assert.equal(
        buildCompactRoster(state),
        'c1=Mara\\; next\\=c99; c2=A\\=B\\; C\\=D',
    );
    assert.equal(
        buildCompactRegistryState(state),
        'count=2; roster=c1=Mara\\; next\\=c99,c2=A\\=B\\; C\\=D; next=c3',
    );
});

test('backslashes are escaped before other characters', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Escaped\\,Value', color: '#111111' },
            c2: { name: 'Path\\to\\file', color: '#222222' },
            c3: { name: 'Mara\\; next\\=c99', color: '#333333' },
        },
    };

    assert.equal(
        buildCompactRoster(state),
        'c1=Escaped\\\\\\,Value; c2=Path\\\\to\\\\file; c3=Mara\\\\\\; next\\\\\\=c99',
    );
    assert.equal(
        buildCompactRegistryState(state),
        'count=3; roster=c1=Escaped\\\\\\,Value,c2=Path\\\\to\\\\file,c3=Mara\\\\\\; next\\\\\\=c99; next=c4',
    );
});

test('newlines, carriage returns, and tabs are serialized rather than emitted literally', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Line 1\nLine 2', color: '#111111' },
            c2: { name: 'Return\rLine', color: '#222222' },
            c3: { name: 'Tab\tSeparated', color: '#333333' },
            c4: { name: 'All\r\n\tTogether', color: '#444444' },
        },
    };

    const roster = buildCompactRoster(state);
    const registryState = buildCompactRegistryState(state);

    assert.equal(
        roster,
        'c1=Line 1\\nLine 2; c2=Return\\rLine; c3=Tab\\tSeparated; c4=All\\r\\n\\tTogether',
    );
    assert.equal(
        registryState,
        'count=4; roster=c1=Line 1\\nLine 2,c2=Return\\rLine,c3=Tab\\tSeparated,c4=All\\r\\n\\tTogether; next=c5',
    );

    assert.equal(roster.includes('\n'), false);
    assert.equal(roster.includes('\r'), false);
    assert.equal(roster.includes('\t'), false);
    assert.equal(registryState.includes('\n'), false);
    assert.equal(registryState.includes('\r'), false);
    assert.equal(registryState.includes('\t'), false);
});

test('normal names retain the exact existing output without change', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
            c3: { name: 'Maria', color: '#E69F00' },
        },
    };

    assert.equal(buildCompactRoster(state), 'c1=Catherine; c3=Maria');
    assert.equal(
        buildCompactRegistryState(state),
        'count=2; roster=c1=Catherine,c3=Maria; next=c2',
    );
});

test('escaping does not modify the source assignment name or ordered entries', () => {
    const originalName = 'Mara; next=c99, tab:\t\\end';
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: originalName, color: '#56B4E9' },
        },
    };

    const compactRoster = buildCompactRoster(state);
    const compactState = buildCompactRegistryState(state);
    const entries = getOrderedAssignmentEntries(state);

    assert.equal(state.assignments.c1.name, originalName);
    assert.equal(entries[0][1].name, originalName);
    assert.notEqual(compactRoster, `c1=${originalName}`);
    assert.equal(
        compactRoster,
        'c1=Mara\\; next\\=c99\\, tab:\\t\\\\end',
    );
    assert.equal(
        compactState,
        'count=1; roster=c1=Mara\\; next\\=c99\\, tab:\\t\\\\end; next=c2',
    );
});

test('both buildCompactRoster and buildCompactRegistryState apply identical escaping rules', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: 'Complex = and ; and , and \\ and \n and \r and \t test',
                color: '#123456',
            },
        },
    };

    const roster = buildCompactRoster(state);
    const registryState = buildCompactRegistryState(state);

    const expectedEscapedSegment =
        'c1=Complex \\= and \\; and \\, and \\\\ and \\n and \\r and \\t test';

    assert.equal(roster, expectedEscapedSegment);
    assert.equal(
        registryState,
        `count=1; roster=${expectedEscapedSegment}; next=c2`,
    );
});