import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState } from '../src/domain.js';
import { adjustColorForContrast } from '../src/color-contrast.js';
import { prepareRegistrationProposals } from '../src/proposal-preparation.js';

test('1. Invalid null options -> invalid-options', () => {
    for (const invalidOptions of [null, undefined, 42, 'invalid', []]) {
        const result = prepareRegistrationProposals('Hello', createEmptyState(), invalidOptions);
        assert.deepEqual(result, {
            status: 'invalid-options',
            proposals: [],
            errors: ['invalid-options'],
        });
    }
});

test('2. Missing backgroundColor -> invalid-options', () => {
    assert.deepEqual(prepareRegistrationProposals('Hello', createEmptyState(), {}), {
        status: 'invalid-options',
        proposals: [],
        errors: ['invalid-options'],
    });

    assert.deepEqual(
        prepareRegistrationProposals('Hello', createEmptyState(), { minimumContrast: 4.5 }),
        {
            status: 'invalid-options',
            proposals: [],
            errors: ['invalid-options'],
        },
    );
});

test('3. Invalid background color -> invalid-options', () => {
    for (const badBg of ['invalid', '#ABC', '#1234567', '', 123, null, 'red', 'rgb(0,0,0)']) {
        const result = prepareRegistrationProposals('Hello', createEmptyState(), {
            backgroundColor: badBg,
        });
        assert.deepEqual(result, {
            status: 'invalid-options',
            proposals: [],
            errors: ['invalid-options'],
        });
    }
});

test('4. Extra option key -> invalid-options', () => {
    const result = prepareRegistrationProposals('Hello', createEmptyState(), {
        backgroundColor: '#181818',
        extra: true,
    });
    assert.deepEqual(result, {
        status: 'invalid-options',
        proposals: [],
        errors: ['invalid-options'],
    });
});

test('5. Invalid minimumContrast -> invalid-options', () => {
    for (const badRatio of [0, 0.99, 21.01, 25, -1, NaN, Infinity, -Infinity, '4.5', null, {}]) {
        const result = prepareRegistrationProposals('Hello', createEmptyState(), {
            backgroundColor: '#181818',
            minimumContrast: badRatio,
        });
        assert.deepEqual(result, {
            status: 'invalid-options',
            proposals: [],
            errors: ['invalid-options'],
        });
    }
});

test('6. Omitted minimumContrast uses 4.5', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#777777"} -->',
    ].join('\n');

    const resultOmitted = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#FFFFFF',
    });
    const resultExplicit = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#FFFFFF',
        minimumContrast: 4.5,
    });

    assert.equal(resultOmitted.status, 'ready');
    assert.deepEqual(resultOmitted, resultExplicit);
    assert.ok(resultOmitted.proposals[0].contrastRatio >= 4.5);
});

test('7. Explicit undefined minimumContrast uses 4.5', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#777777"} -->',
    ].join('\n');

    const resultUndefined = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#FFFFFF',
        minimumContrast: undefined,
    });
    const resultExplicit = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#FFFFFF',
        minimumContrast: 4.5,
    });

    assert.equal(resultUndefined.status, 'ready');
    assert.deepEqual(resultUndefined, resultExplicit);
});

test('8. Invalid options stop before parser behavior matters', () => {
    const result = prepareRegistrationProposals(null, null, null);
    assert.deepEqual(result, {
        status: 'invalid-options',
        proposals: [],
        errors: ['invalid-options'],
    });

    const result2 = prepareRegistrationProposals('<!-- CD_NEW not-json -->', createEmptyState(), {
        backgroundColor: 'invalid-hex',
    });
    assert.deepEqual(result2, {
        status: 'invalid-options',
        proposals: [],
        errors: ['invalid-options'],
    });
});

test('9. Ordinary message with no trailer -> no-proposals', () => {
    const result = prepareRegistrationProposals('Just ordinary message text.', createEmptyState(), {
        backgroundColor: '#181818',
    });
    assert.deepEqual(result, {
        status: 'no-proposals',
        proposals: [],
        errors: [],
    });
});

test('10. No-proposals does not require valid registry state', () => {
    for (const badState of [null, undefined, 42, 'invalid', { corrupt: true }, { schemaVersion: 99 }]) {
        const result = prepareRegistrationProposals('Just ordinary message text.', badState, {
            backgroundColor: '#181818',
        });
        assert.deepEqual(result, {
            status: 'no-proposals',
            proposals: [],
            errors: [],
        });
    }
});

test('11. No-proposals does not perform contrast processing', () => {
    const result = prepareRegistrationProposals('No trailer here.', createEmptyState(), {
        backgroundColor: '#808080',
        minimumContrast: 21,
    });
    assert.deepEqual(result, {
        status: 'no-proposals',
        proposals: [],
        errors: [],
    });
});

test('12. Valid parser proposal + valid registry -> ready', () => {
    const message = [
        '[c2]I am Mara.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
        },
    };
    const result = prepareRegistrationProposals(message, state, {
        backgroundColor: '#181818',
    });

    assert.equal(result.status, 'ready');
    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0].id, 'c2');
    assert.equal(result.proposals[0].name, 'Mara');
    assert.equal(result.proposals[0].proposedColor, '#B86FD4');
    assert.equal(typeof result.proposals[0].color, 'string');
    assert.equal(typeof result.proposals[0].colorAdjusted, 'boolean');
    assert.equal(typeof result.proposals[0].contrastRatio, 'number');
    assert.ok(result.proposals[0].contrastRatio >= 4.5);
});

test('13. Parser error -> parse-rejected', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW not-json -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#181818',
    });

    assert.equal(result.status, 'parse-rejected');
    assert.deepEqual(result.proposals, []);
    assert.ok(result.errors.length > 0);
});

test('14. Parser error codes are preserved exactly', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#181818',
    });

    assert.deepEqual(result, {
        status: 'parse-rejected',
        proposals: [],
        errors: ['invalid-proposal-shape'],
    });
});

test('15. Registry conflict -> registry-rejected', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
        },
    };
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, state, {
        backgroundColor: '#181818',
    });

    assert.equal(result.status, 'registry-rejected');
    assert.deepEqual(result.proposals, []);
});

test('16. Validator error codes are preserved exactly', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
        },
    };
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, state, {
        backgroundColor: '#181818',
    });

    assert.deepEqual(result, {
        status: 'registry-rejected',
        proposals: [],
        errors: ['id-already-assigned'],
    });
});

test('17. Registry failure prevents contrast processing', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
        },
    };
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, state, {
        backgroundColor: '#808080',
        minimumContrast: 21,
    });

    assert.deepEqual(result, {
        status: 'registry-rejected',
        proposals: [],
        errors: ['id-already-assigned'],
    });
});

test('18. Already-readable color remains unchanged', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#FFFFFF"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#000000',
        minimumContrast: 4.5,
    });

    assert.equal(result.status, 'ready');
    assert.equal(result.proposals[0].color, '#FFFFFF');
    assert.equal(result.proposals[0].proposedColor, '#FFFFFF');
    assert.equal(result.proposals[0].colorAdjusted, false);
    assert.equal(result.proposals[0].contrastRatio, 21);
});

test('19. Already-readable proposal has colorAdjusted=false', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#000000"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#FFFFFF',
    });

    assert.equal(result.status, 'ready');
    assert.equal(result.proposals[0].colorAdjusted, false);
});

test('20. Lowercase AI color appears as normalized uppercase proposedColor', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#b86fd4"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#181818',
    });

    assert.equal(result.status, 'ready');
    assert.equal(result.proposals[0].proposedColor, '#B86FD4');
});

test('21. Repairable low-contrast foreground produces ready', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#E0E0E0"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#FFFFFF',
        minimumContrast: 4.5,
    });

    assert.equal(result.status, 'ready');
});

test('22. Repairable color has colorAdjusted=true', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#E0E0E0"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#FFFFFF',
        minimumContrast: 4.5,
    });

    assert.equal(result.proposals[0].colorAdjusted, true);
});

test('23. Final repaired color meets minimumContrast', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#555555"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#444444',
        minimumContrast: 5.0,
    });

    assert.equal(result.status, 'ready');
    assert.ok(result.proposals[0].contrastRatio >= 5.0);
});

test('24. contrastRatio matches the underlying adjustment result', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#404040"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#202020',
        minimumContrast: 4.5,
    });

    assert.equal(result.status, 'ready');
    const expected = adjustColorForContrast('#404040', '#202020', 4.5);
    assert.equal(result.proposals[0].contrastRatio, expected.ratio);
    assert.equal(result.proposals[0].color, expected.color);
});

test('25. Multiple valid proposals preserve order', () => {
    const message = [
        '[c1]Catherine here.[/c]',
        '[c2]Mara here.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Catherine","color":"#56B4E9"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#181818',
    });

    assert.equal(result.status, 'ready');
    assert.equal(result.proposals.length, 2);
    assert.equal(result.proposals[0].id, 'c1');
    assert.equal(result.proposals[0].name, 'Catherine');
    assert.equal(result.proposals[1].id, 'c2');
    assert.equal(result.proposals[1].name, 'Mara');
});

test('26. One contrast-unreachable proposal rejects all proposals', () => {
    const message = [
        '[c1]Catherine here.[/c]',
        '[c2]Mara here.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Catherine","color":"#56B4E9"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#808080',
        minimumContrast: 10.0,
    });

    assert.deepEqual(result, {
        status: 'contrast-rejected',
        proposals: [],
        errors: ['contrast-unreachable'],
    });
});

test('27. No partial proposals are returned after contrast failure', () => {
    const message = [
        '[c1]First.[/c]',
        '[c2]Second.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"First","color":"#FFFFFF"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Second","color":"#808080"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#808080',
        minimumContrast: 10.0,
    });

    assert.equal(result.status, 'contrast-rejected');
    assert.deepEqual(result.proposals, []);
});

test('28. High valid contrast target may produce contrast-rejected', () => {
    const message = [
        '[c1]Speaking.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#808080"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#777777',
        minimumContrast: 21,
    });

    assert.deepEqual(result, {
        status: 'contrast-rejected',
        proposals: [],
        errors: ['contrast-unreachable'],
    });
});

test('29. Background color may be lowercase/trimmed if existing normalization accepts it', () => {
    const message = [
        '[c1]Speaking.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '  #ffffff  ',
    });

    assert.equal(result.status, 'ready');
    assert.equal(result.proposals.length, 1);
});

test('30. Output final colors are uppercase canonical hex', () => {
    const hexPattern = /^#[0-9A-F]{6}$/;
    const message = [
        '[c1]Speaking.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#abcdef"} -->',
    ].join('\n');
    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: ' #1a2b3c ',
        minimumContrast: 4.5,
    });

    assert.equal(result.status, 'ready');
    assert.ok(hexPattern.test(result.proposals[0].proposedColor));
    assert.ok(hexPattern.test(result.proposals[0].color));
});

test('31. Input state is not mutated', () => {
    const originalAssignment = { name: 'Catherine', color: '#56B4E9' };
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: originalAssignment,
        },
    };
    const snapshot = JSON.parse(JSON.stringify(state));

    const message = [
        '[c2]Mara here.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    prepareRegistrationProposals(message, state, { backgroundColor: '#181818' });

    assert.deepEqual(state, snapshot);
    assert.strictEqual(state.assignments.c1, originalAssignment);
});

test('32. Input options object is not mutated', () => {
    const options = { backgroundColor: '#181818', minimumContrast: 4.5 };
    const snapshot = JSON.parse(JSON.stringify(options));

    const message = [
        '[c1]Mara here.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    prepareRegistrationProposals(message, createEmptyState(), options);

    assert.deepEqual(options, snapshot);
});

test('33. Returned proposals are detached', () => {
    const message = [
        '[c1]Mara here.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#181818',
    });
    assert.equal(result.status, 'ready');

    result.proposals[0].name = 'Mutated';
    result.proposals[0].color = '#000000';
    result.proposals.push({
        id: 'injected',
        name: 'Injected',
        proposedColor: '#000000',
        color: '#000000',
        colorAdjusted: false,
        contrastRatio: 21,
    });

    const result2 = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#181818',
    });
    assert.equal(result2.status, 'ready');
    assert.equal(result2.proposals.length, 1);
    assert.equal(result2.proposals[0].name, 'Mara');
});

test('34. Returned error arrays are detached', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW not-json -->',
    ].join('\n');

    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#181818',
    });
    assert.equal(result.status, 'parse-rejected');
    result.errors.push('injected-error');

    const result2 = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#181818',
    });
    assert.deepEqual(result2.errors, ['invalid-json']);
});

test('35. Repeated calls do not share mutable output state', () => {
    const message = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');
    const options = { backgroundColor: '#181818' };

    const first = prepareRegistrationProposals(message, createEmptyState(), options);
    const second = prepareRegistrationProposals(message, createEmptyState(), options);

    assert.deepEqual(first, second);
    assert.notStrictEqual(first.proposals, second.proposals);
    assert.notStrictEqual(first.proposals[0], second.proposals[0]);
});

test('36. Function is synchronous', () => {
    const result = prepareRegistrationProposals('msg', createEmptyState(), {
        backgroundColor: '#181818',
    });
    assert.equal(result instanceof Promise, false);
    assert.equal(typeof result?.then, 'undefined');
});

test('37. No SillyTavern/DOM dependency exists', () => {
    assert.equal(typeof globalThis.window, 'undefined');
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.SillyTavern, 'undefined');
});

test('38. Proposal allocation order from A5 remains meaningful and is not reordered', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'One', color: '#111111' },
            c3: { name: 'Three', color: '#333333' },
        },
    };
    const message = [
        '[c4]Four.[/c]',
        '[c2]Two.[/c]',
        '<!-- CD_NEW {"id":"c4","name":"Four","color":"#444444"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Two","color":"#222222"} -->',
    ].join('\n');

    const result = prepareRegistrationProposals(message, state, {
        backgroundColor: '#FFFFFF',
    });
    assert.deepEqual(result, {
        status: 'registry-rejected',
        proposals: [],
        errors: ['unexpected-id'],
    });
});

test('39. A message containing multiple proposals where validator rejects one returns registry-rejected atomically', () => {
    const state = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Catherine', color: '#56B4E9' },
        },
    };
    const message = [
        '[c2]Mara here.[/c]',
        '[c3]Catherine speaking.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
        '<!-- CD_NEW {"id":"c3","name":"Catherine","color":"#68A9D8"} -->',
    ].join('\n');

    const result = prepareRegistrationProposals(message, state, {
        backgroundColor: '#181818',
    });
    assert.deepEqual(result, {
        status: 'registry-rejected',
        proposals: [],
        errors: ['name-already-assigned'],
    });
});

test('40. A message containing one malformed CD_NEW among valid ones returns parse-rejected atomically', () => {
    const message = [
        '[c1]Alice.[/c]',
        '[c2]Bob.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#123456"} -->',
        '<!-- CD_NEW not-json -->',
    ].join('\n');

    const result = prepareRegistrationProposals(message, createEmptyState(), {
        backgroundColor: '#181818',
    });
    assert.deepEqual(result, {
        status: 'parse-rejected',
        proposals: [],
        errors: ['invalid-json'],
    });
});