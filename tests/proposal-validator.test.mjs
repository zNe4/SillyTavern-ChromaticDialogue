// tests/proposal-validator.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState } from '../src/domain.js';
import { validateRegistrationProposals } from '../src/proposal-validator.js';

test('1. empty valid state + empty proposals succeeds', () => {
    const state = createEmptyState();
    const result = validateRegistrationProposals(state, []);

    assert.deepEqual(result, {
        ok: true,
        proposals: [],
        errors: [],
    });
});

test('2. non-empty valid state + empty proposals succeeds', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
            c3: { name: 'Maria', color: '#E69F00' },
        },
    };

    const result = validateRegistrationProposals(state, []);

    assert.deepEqual(result, {
        ok: true,
        proposals: [],
        errors: [],
    });
});

test('3. invalid state fails closed', () => {
    for (const badState of [null, undefined, 42, 'invalid', [], {}, false]) {
        assert.deepEqual(validateRegistrationProposals(badState, []), {
            ok: false,
            proposals: [],
            errors: ['invalid-state'],
        });
    }
});

test('4. unsupported schema fails closed', () => {
    for (const badSchema of [0, 2, 999, '1', null, undefined]) {
        const state = {
            schemaVersion: badSchema,
            assignments: {},
        };

        assert.deepEqual(validateRegistrationProposals(state, []), {
            ok: false,
            proposals: [],
            errors: ['invalid-state'],
        });
    }
});

test('5. malformed existing assignment causes invalid-state rather than being silently discarded', () => {
    const states = [
        {
            schemaVersion: 1,
            assignments: {
                c1: null,
            },
        },
        {
            schemaVersion: 1,
            assignments: {
                c1: { name: '', color: '#123456' },
            },
        },
        {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: 'invalid-hex' },
            },
        },
        {
            schemaVersion: 1,
            assignments: {
                c0: { name: 'Alice', color: '#123456' },
            },
        },
    ];

    for (const state of states) {
        assert.deepEqual(validateRegistrationProposals(state, []), {
            ok: false,
            proposals: [],
            errors: ['invalid-state'],
        });
    }
});

test('6. non-array proposals -> invalid-proposals', () => {
    for (const badProposals of [null, undefined, 42, 'proposals', {}, true]) {
        assert.deepEqual(validateRegistrationProposals(createEmptyState(), badProposals), {
            ok: false,
            proposals: [],
            errors: ['invalid-proposals'],
        });
    }
});

test('7. malformed proposal object -> invalid-proposals', () => {
    for (const item of [null, undefined, 42, 'str', [], false]) {
        assert.deepEqual(validateRegistrationProposals(createEmptyState(), [item]), {
            ok: false,
            proposals: [],
            errors: ['invalid-proposals'],
        });
    }
});

test('8. extra proposal key -> invalid-proposals', () => {
    const proposals = [
        {
            id: 'c1',
            name: 'Alice',
            color: '#123456',
            extra: 'forbidden',
        },
    ];

    assert.deepEqual(validateRegistrationProposals(createEmptyState(), proposals), {
        ok: false,
        proposals: [],
        errors: ['invalid-proposals'],
    });
});

test('9. invalid proposal ID -> invalid-proposals', () => {
    for (const badId of ['c0', 'c100', 'C1', ' c1 ', '1', 'c01', '']) {
        const proposals = [
            { id: badId, name: 'Alice', color: '#123456' },
        ];

        assert.deepEqual(validateRegistrationProposals(createEmptyState(), proposals), {
            ok: false,
            proposals: [],
            errors: ['invalid-proposals'],
        });
    }
});

test('10. empty proposal name -> invalid-proposals', () => {
    for (const badName of ['', '   ', null, 123]) {
        const proposals = [
            { id: 'c1', name: badName, color: '#123456' },
        ];

        assert.deepEqual(validateRegistrationProposals(createEmptyState(), proposals), {
            ok: false,
            proposals: [],
            errors: ['invalid-proposals'],
        });
    }
});

test('11. invalid proposal color -> invalid-proposals', () => {
    for (const badColor of ['#ABC', '#GGGGGG', '123456', '#1234567', '', null, 123]) {
        const proposals = [
            { id: 'c1', name: 'Alice', color: badColor },
        ];

        assert.deepEqual(validateRegistrationProposals(createEmptyState(), proposals), {
            ok: false,
            proposals: [],
            errors: ['invalid-proposals'],
        });
    }
});

test('12. input name is normalized', () => {
    const result = validateRegistrationProposals(createEmptyState(), [
        { id: 'c1', name: '  Alice Smith  ', color: '#123456' },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.proposals[0].name, 'Alice Smith');
});

test('13. input lowercase color becomes uppercase', () => {
    const result = validateRegistrationProposals(createEmptyState(), [
        { id: 'c1', name: 'Alice', color: ' #abcdef ' },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.proposals[0].color, '#ABCDEF');
});

test('14. c1 + c3 registry accepts c2', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
            c3: { name: 'Daniel', color: '#009E73' },
        },
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c2', name: 'Mara', color: '#B86FD4' },
    ]);

    assert.deepEqual(result, {
        ok: true,
        proposals: [
            { id: 'c2', name: 'Mara', color: '#B86FD4' },
        ],
        errors: [],
    });
});

test('15. c1 + c3 accepts proposals c2 then c4', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
            c3: { name: 'Daniel', color: '#009E73' },
        },
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c2', name: 'Mara', color: '#B86FD4' },
        { id: 'c4', name: 'Jonas', color: '#68A9D8' },
    ]);

    assert.deepEqual(result, {
        ok: true,
        proposals: [
            { id: 'c2', name: 'Mara', color: '#B86FD4' },
            { id: 'c4', name: 'Jonas', color: '#68A9D8' },
        ],
        errors: [],
    });
});

test('16. c1 + c3 rejects first proposal c4 as unexpected-id', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
            c3: { name: 'Daniel', color: '#009E73' },
        },
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c4', name: 'Mara', color: '#B86FD4' },
    ]);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: ['unexpected-id'],
    });
});

test('17. c1 + c3 rejects c2 then c5 as unexpected-id', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
            c3: { name: 'Daniel', color: '#009E73' },
        },
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c2', name: 'Mara', color: '#B86FD4' },
        { id: 'c5', name: 'Jonas', color: '#68A9D8' },
    ]);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: ['unexpected-id'],
    });
});

test('18. existing c1 proposal using c1 -> id-already-assigned', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
        },
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c1', name: 'Mara', color: '#B86FD4' },
    ]);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: ['id-already-assigned'],
    });
});

test('19. existing Catherine rejects proposed Catherine', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
        },
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c2', name: 'Catherine', color: '#B86FD4' },
    ]);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: ['name-already-assigned'],
    });
});

test('20. existing Catherine rejects proposed catherine', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
        },
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c2', name: 'catherine', color: '#B86FD4' },
    ]);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: ['name-already-assigned'],
    });
});

test('21. existing Catherine rejects proposed CATHERINE', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
        },
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c2', name: 'CATHERINE', color: '#B86FD4' },
    ]);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: ['name-already-assigned'],
    });
});

test('22. existing Catherine does NOT automatically reject Dr. Catherine', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
        },
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c2', name: 'Dr. Catherine', color: '#B86FD4' },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.proposals[0].name, 'Dr. Catherine');
});

test('23. two proposals named Mara and mara -> duplicate-name', () => {
    const result = validateRegistrationProposals(createEmptyState(), [
        { id: 'c1', name: 'Mara', color: '#111111' },
        { id: 'c2', name: 'mara', color: '#222222' },
    ]);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: ['duplicate-name'],
    });
});

test('24. duplicate proposal IDs -> duplicate-id', () => {
    const result = validateRegistrationProposals(createEmptyState(), [
        { id: 'c1', name: 'Mara', color: '#111111' },
        { id: 'c1', name: 'Jonas', color: '#222222' },
    ]);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: ['duplicate-id'],
    });
});

test('25. c1 through c98 + one c99 proposal succeeds', () => {
    const assignments = {};
    for (let i = 1; i <= 98; i += 1) {
        assignments[`c${i}`] = {
            name: `Character ${i}`,
            color: '#123456',
        };
    }
    const state = {
        schemaVersion: 1,
        assignments,
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c99', name: 'Ninety Nine', color: '#B86FD4' },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0].id, 'c99');
});

test('26. c1 through c98 + two proposals -> registry-capacity-exceeded', () => {
    const assignments = {};
    for (let i = 1; i <= 98; i += 1) {
        assignments[`c${i}`] = {
            name: `Character ${i}`,
            color: '#123456',
        };
    }
    const state = {
        schemaVersion: 1,
        assignments,
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c99', name: 'Char A', color: '#111111' },
        { id: 'c1', name: 'Char B', color: '#222222' },
    ]);

    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('registry-capacity-exceeded'));
});

test('27. full c1-c99 + no proposals succeeds', () => {
    const assignments = {};
    for (let i = 1; i <= 99; i += 1) {
        assignments[`c${i}`] = {
            name: `Character ${i}`,
            color: '#123456',
        };
    }
    const fullState = {
        schemaVersion: 1,
        assignments,
    };

    assert.deepEqual(validateRegistrationProposals(fullState, []), {
        ok: true,
        proposals: [],
        errors: [],
    });
});

test('28. full c1-c99 + one proposal fails capacity', () => {
    const assignments = {};
    for (let i = 1; i <= 99; i += 1) {
        assignments[`c${i}`] = {
            name: `Character ${i}`,
            color: '#123456',
        };
    }
    const fullState = {
        schemaVersion: 1,
        assignments,
    };

    const result = validateRegistrationProposals(fullState, [
        { id: 'c1', name: 'New Mara', color: '#B86FD4' },
    ]);

    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('registry-capacity-exceeded'));
});

test('29. gap allocation uses actual free IDs rather than count+1', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'One', color: '#111111' },
            c3: { name: 'Three', color: '#333333' },
            c7: { name: 'Seven', color: '#777777' },
        },
    };

    const rejected = validateRegistrationProposals(state, [
        { id: 'c4', name: 'Four', color: '#444444' },
    ]);

    assert.deepEqual(rejected, {
        ok: false,
        proposals: [],
        errors: ['unexpected-id'],
    });

    const accepted = validateRegistrationProposals(state, [
        { id: 'c2', name: 'Two', color: '#222222' },
        { id: 'c4', name: 'Four', color: '#444444' },
    ]);

    assert.equal(accepted.ok, true);
    assert.equal(accepted.proposals[0].id, 'c2');
    assert.equal(accepted.proposals[1].id, 'c4');
});

test('30. proposal order is meaningful and is not sorted before validation', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'One', color: '#111111' },
            c3: { name: 'Three', color: '#333333' },
        },
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c4', name: 'Four', color: '#444444' },
        { id: 'c2', name: 'Two', color: '#222222' },
    ]);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: ['unexpected-id'],
    });
});

test('31. conflict-phase failure does not additionally emit unexpected-id', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'One', color: '#111111' },
        },
    };

    const result = validateRegistrationProposals(state, [
        { id: 'c1', name: 'Mara', color: '#222222' },
    ]);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: ['id-already-assigned'],
    });
});

test('32. returned success proposals are detached from the input', () => {
    const proposals = [
        { id: 'c1', name: 'Alice', color: '#123456' },
    ];

    const result = validateRegistrationProposals(createEmptyState(), proposals);

    assert.equal(result.ok, true);
    assert.notStrictEqual(result.proposals[0], proposals[0]);

    result.proposals[0].name = 'Changed';
    result.proposals[0].color = '#FFFFFF';

    assert.equal(proposals[0].name, 'Alice');
    assert.equal(proposals[0].color, '#123456');
});

test('33. source registry is not mutated', () => {
    const originalAssignment = { name: 'Catherine', color: '#56B4E9' };
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: originalAssignment,
        },
    };
    const snapshot = JSON.parse(JSON.stringify(state));

    validateRegistrationProposals(state, [
        { id: 'c2', name: 'Mara', color: '#B86FD4' },
    ]);

    assert.deepEqual(state, snapshot);
    assert.strictEqual(state.assignments.c1, originalAssignment);
});

test('34. source proposal array/objects are not mutated', () => {
    const proposal = { id: 'c1', name: '  Alice  ', color: ' #abcdef ' };
    const proposals = [proposal];

    const result = validateRegistrationProposals(createEmptyState(), proposals);

    assert.equal(result.ok, true);
    assert.equal(proposals.length, 1);
    assert.strictEqual(proposals[0], proposal);
    assert.equal(proposal.name, '  Alice  ');
    assert.equal(proposal.color, ' #abcdef ');
});

test('35. repeated calls do not share mutable result state', () => {
    const proposals = [
        { id: 'c1', name: 'Alice', color: '#123456' },
    ];

    const first = validateRegistrationProposals(createEmptyState(), proposals);
    first.proposals.push({ id: 'c9', name: 'Injected', color: '#000000' });
    first.errors.push('injected-error');

    const second = validateRegistrationProposals(createEmptyState(), proposals);

    assert.deepEqual(second, {
        ok: true,
        proposals: [
            { id: 'c1', name: 'Alice', color: '#123456' },
        ],
        errors: [],
    });
});

test('36. function is synchronous and never returns a Promise', () => {
    const result = validateRegistrationProposals(createEmptyState(), []);

    assert.equal(result instanceof Promise, false);
    assert.equal(typeof result?.then, 'undefined');
});

test('37. multiple applicable Phase 2 errors are returned once each in deterministic error-code order', () => {
    const assignments = {};
    for (let i = 1; i <= 98; i += 1) {
        assignments[`c${i}`] = {
            name: `Char ${i}`,
            color: '#123456',
        };
    }
    assignments.c1.name = 'Catherine';

    const state = {
        schemaVersion: 1,
        assignments,
    };

    const proposals = [
        { id: 'c1', name: 'Catherine', color: '#111111' },
        { id: 'c1', name: 'catherine', color: '#222222' },
    ];

    const result = validateRegistrationProposals(state, proposals);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: [
            'registry-capacity-exceeded',
            'duplicate-id',
            'duplicate-name',
            'id-already-assigned',
            'name-already-assigned',
        ],
    });
});

test('Phase 1 returns both invalid-state and invalid-proposals in deterministic order when both fail', () => {
    const result = validateRegistrationProposals(null, null);

    assert.deepEqual(result, {
        ok: false,
        proposals: [],
        errors: ['invalid-state', 'invalid-proposals'],
    });
});