import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createEmptyState,
    isValidAssignmentId,
    isValidHexColor,
    normalizeAssignmentId,
    normalizeHexColor,
    normalizeName,
    normalizeState,
    normalizeStateForWrite,
} from '../src/domain.js';

test('assignment IDs are limited to canonical c1 through c99', () => {
    for (const value of ['c1', 'c9', 'c10', 'c99']) {
        assert.equal(isValidAssignmentId(value), true);
    }

    for (const value of [
        null,
        '',
        'c0',
        'c01',
        'c100',
        'C1',
        ' c1 ',
        '1',
    ]) {
        assert.equal(isValidAssignmentId(value), false);
    }
});

test('stored assignment IDs are normalized safely', () => {
    assert.equal(normalizeAssignmentId(' C1 '), 'c1');
    assert.equal(normalizeAssignmentId('c99'), 'c99');
    assert.equal(normalizeAssignmentId('c01'), null);
    assert.equal(normalizeAssignmentId('c100'), null);
    assert.equal(normalizeAssignmentId(1), null);
});

test('names are trimmed and empty names are rejected', () => {
    assert.equal(normalizeName('  Alice  '), 'Alice');
    assert.equal(normalizeName('Alice Smith'), 'Alice Smith');
    assert.equal(normalizeName('   '), null);
    assert.equal(normalizeName(''), null);
    assert.equal(normalizeName(null), null);
});

test('hex colors require six digits and normalize to uppercase', () => {
    assert.equal(isValidHexColor('#A1B2C3'), true);
    assert.equal(isValidHexColor('#a1b2c3'), true);
    assert.equal(isValidHexColor('#ABC'), false);
    assert.equal(isValidHexColor('A1B2C3'), false);
    assert.equal(isValidHexColor(' #A1B2C3 '), false);

    assert.equal(normalizeHexColor(' #a1b2c3 '), '#A1B2C3');
    assert.equal(normalizeHexColor('#ABC'), null);
    assert.equal(normalizeHexColor('#GGGGGG'), null);
    assert.equal(normalizeHexColor(null), null);
});

test('empty states are valid and do not share assignment objects', () => {
    const first = createEmptyState();
    const second = createEmptyState();

    assert.deepEqual(first, {
        schemaVersion: 1,
        assignments: {},
    });
    assert.deepEqual(second, first);
    assert.notStrictEqual(second, first);
    assert.notStrictEqual(second.assignments, first.assignments);

    first.assignments.c1 = {
        name: 'Alice',
        color: '#A1B2C3',
    };

    assert.deepEqual(second.assignments, {});
});

test('missing and malformed version-1 metadata becomes a safe state', () => {
    for (const value of [
        undefined,
        null,
        false,
        42,
        'invalid',
        [],
        {},
        { assignments: null },
        { assignments: [] },
    ]) {
        assert.deepEqual(normalizeState(value), {
            schemaVersion: 1,
            assignments: {},
        });
    }
});

test('partially malformed assignments are skipped and valid values normalize', () => {
    const input = {
        schemaVersion: 1,
        assignments: {
            ' C1 ': {
                name: '  Alice  ',
                color: ' #a1b2c3 ',
            },
            c2: {
                name: '   ',
                color: '#123456',
            },
            c3: {
                name: 'Bob',
                color: '123456',
            },
            c4: null,
            c100: {
                name: 'Carol',
                color: '#654321',
            },
        },
    };

    assert.deepEqual(normalizeState(input), {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: 'Alice',
                color: '#A1B2C3',
            },
        },
    });

    assert.equal(input.assignments[' C1 '].name, '  Alice  ');
    assert.equal(input.assignments[' C1 '].color, ' #a1b2c3 ');
});

test('unsupported explicit schema versions are not interpreted', () => {
    for (const schemaVersion of [0, 2, '1', null]) {
        assert.equal(normalizeState({
            schemaVersion,
            assignments: {},
        }), null);
    }
});

test('valid write states are normalized without mutating the candidate', () => {
    const candidate = {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: '  Alice  ',
                color: ' #a1b2c3 ',
            },
            c99: {
                name: 'Bob',
                color: '#123456',
            },
        },
    };

    assert.deepEqual(normalizeStateForWrite(candidate), {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: 'Alice',
                color: '#A1B2C3',
            },
            c99: {
                name: 'Bob',
                color: '#123456',
            },
        },
    });

    assert.equal(candidate.assignments.c1.name, '  Alice  ');
    assert.equal(candidate.assignments.c1.color, ' #a1b2c3 ');
});

test('write normalization rejects an entirely malformed candidate', () => {
    for (const candidate of [
        null,
        {},
        {
            schemaVersion: 2,
            assignments: {},
        },
        {
            schemaVersion: 1,
            assignments: [],
        },
        {
            schemaVersion: 1,
            assignments: {
                C1: {
                    name: 'Alice',
                    color: '#A1B2C3',
                },
            },
        },
        {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: '',
                    color: '#A1B2C3',
                },
            },
        },
        {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Alice',
                    color: '#ABC',
                },
            },
        },
        {
            schemaVersion: 1,
            assignments: {
                c1: null,
            },
        },
    ]) {
        assert.equal(normalizeStateForWrite(candidate), null);
    }
});
