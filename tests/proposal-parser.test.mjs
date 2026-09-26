import test from 'node:test';
import assert from 'node:assert/strict';

import { parseRegistrationTrailer } from '../src/proposal-parser.js';

test('1. message with no proposals', () => {
    const result = parseRegistrationTrailer('Just ordinary message text.');

    assert.deepEqual(result, {
        ok: true,
        proposals: [],
        errors: [],
    });
});

test('2. empty message and whitespace-only message', () => {
    assert.deepEqual(parseRegistrationTrailer(''), {
        ok: true,
        proposals: [],
        errors: [],
    });

    assert.deepEqual(parseRegistrationTrailer('   \n  \t  \n'), {
        ok: true,
        proposals: [],
        errors: [],
    });
});

test('3. non-string input', () => {
    for (const value of [null, undefined, 42, {}, [], true, Symbol('msg')]) {
        assert.deepEqual(parseRegistrationTrailer(value), {
            ok: false,
            proposals: [],
            errors: ['invalid-message'],
        });
    }
});

test('4. one valid proposal', () => {
    const input = [
        '[c2]Mara enters.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: true,
        proposals: [
            {
                id: 'c2',
                name: 'Mara',
                color: '#B86FD4',
            },
        ],
        errors: [],
    });
});

test('5. lowercase color becomes uppercase', () => {
    const input = [
        '[c3]Hello.[/c]',
        '<!-- CD_NEW {"id":"c3","name":"Bob","color":"#a1b2c3"} -->',
    ].join('\n');

    const result = parseRegistrationTrailer(input);

    assert.equal(result.ok, true);
    assert.equal(result.proposals[0].color, '#A1B2C3');
});

test('6. name is normalized and trimmed', () => {
    const input = [
        '[c1]Speaking.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"   Mara Jade   ","color":"#123456"} -->',
    ].join('\n');

    const result = parseRegistrationTrailer(input);

    assert.equal(result.ok, true);
    assert.equal(result.proposals[0].name, 'Mara Jade');
});

test('7. two valid proposals preserve control-record order', () => {
    const input = [
        '[c4]Jonas here.[/c]',
        '[c2]Mara here.[/c]',
        '<!-- CD_NEW {"id":"c4","name":"Jonas","color":"#68A9D8"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: true,
        proposals: [
            {
                id: 'c4',
                name: 'Jonas',
                color: '#68A9D8',
            },
            {
                id: 'c2',
                name: 'Mara',
                color: '#B86FD4',
            },
        ],
        errors: [],
    });
});

test('8. trailing blank lines are accepted', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
        '',
        '   ',
        '',
    ].join('\n');

    const result = parseRegistrationTrailer(input);

    assert.equal(result.ok, true);
    assert.equal(result.proposals.length, 1);
});

test('9. leading whitespace on comment lines is accepted', () => {
    const input = [
        '[c2]Hello.[/c]',
        '   <!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    const result = parseRegistrationTrailer(input);

    assert.equal(result.ok, true);
    assert.equal(result.proposals[0].id, 'c2');
});

test('10. proposal comment followed by visible text is rejected as misplaced', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
        'More story after registration.',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['misplaced-control-record'],
    });
});

test('11. proposal comment followed by an unrelated HTML comment is rejected as misplaced', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
        '<!-- some unrelated comment -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['misplaced-control-record'],
    });
});

test('12. a non-trailing CD_NEW comment is rejected without marker-not-used', () => {
    const input = [
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
        '',
        '[c2]Visible story after it.[/c]',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['misplaced-control-record'],
    });
});

test('13. ordinary prose mentioning CD_NEW is ignored', () => {
    const input = 'The documentation calls this mechanism CD_NEW and recommends it.';

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: true,
        proposals: [],
        errors: [],
    });
});

test('14. ordinary unrelated HTML comments are ignored', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- ordinary comment before trailer -->',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: true,
        proposals: [
            {
                id: 'c2',
                name: 'Mara',
                color: '#B86FD4',
            },
        ],
        errors: [],
    });
});

test('15. invalid JSON fails safely', () => {
    const inputs = [
        '[c2]Hello.[/c]\n<!-- CD_NEW not-json -->',
        '[c2]Hello.[/c]\n<!-- CD_NEW {"id":"c2" -->',
    ];

    for (const input of inputs) {
        assert.deepEqual(parseRegistrationTrailer(input), {
            ok: false,
            proposals: [],
            errors: ['invalid-json'],
        });
    }
});

test('16. missing required key is rejected', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['invalid-proposal-shape'],
    });
});

test('17. extra key is rejected', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4","extra":"field"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['invalid-proposal-shape'],
    });
});

test('18. array JSON value is rejected', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- CD_NEW ["c2","Mara","#B86FD4"] -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['invalid-proposal-shape'],
    });
});

test('19. invalid assignment ID is rejected', () => {
    for (const badId of ['c0', 'c100', 'C2', ' c2 ', '2']) {
        const input = [
            `[${badId}]Hello.[/c]`,
            `<!-- CD_NEW {"id":"${badId}","name":"Mara","color":"#B86FD4"} -->`,
        ].join('\n');

        const result = parseRegistrationTrailer(input);
        assert.equal(result.ok, false);
        assert.deepEqual(result.errors, ['invalid-proposal-value']);
    }
});

test('20. empty or whitespace name is rejected', () => {
    for (const badName of ['', '   ']) {
        const input = [
            '[c2]Hello.[/c]',
            `<!-- CD_NEW {"id":"c2","name":"${badName}","color":"#B86FD4"} -->`,
        ].join('\n');

        assert.deepEqual(parseRegistrationTrailer(input), {
            ok: false,
            proposals: [],
            errors: ['invalid-proposal-value'],
        });
    }
});

test('21. invalid color is rejected', () => {
    for (const badColor of ['#ABC', '#GGGGGG', 'B86FD4', '#1234567', '']) {
        const input = [
            '[c2]Hello.[/c]',
            `<!-- CD_NEW {"id":"c2","name":"Mara","color":"${badColor}"} -->`,
        ].join('\n');

        assert.deepEqual(parseRegistrationTrailer(input), {
            ok: false,
            proposals: [],
            errors: ['invalid-proposal-value'],
        });
    }
});

test('22. proposal ID without matching [cN] in visible body is rejected', () => {
    const input = [
        'Mara enters but speaks no bracketed lines.',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['marker-not-used'],
    });
});

test('23. proposal ID with matching [cN] in visible body is accepted', () => {
    const input = [
        '[c2]Mara speaks.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    const result = parseRegistrationTrailer(input);
    assert.equal(result.ok, true);
    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0].id, 'c2');
});

test('24. duplicate proposal ID rejects the entire message', () => {
    const input = [
        '[c2]Speaking.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Mara Two","color":"#68A9D8"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['duplicate-id'],
    });
});

test('25. duplicate normalized proposal name rejects the entire message', () => {
    const input = [
        '[c2]Mara one.[/c]',
        '[c3]Mara two.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
        '<!-- CD_NEW {"id":"c3","name":"  Mara  ","color":"#68A9D8"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['duplicate-name'],
    });
});

test('26. one malformed proposal among several rejects ALL proposals', () => {
    const input = [
        '[c1]Alice.[/c]',
        '[c2]Bob.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#123456"} -->',
        '<!-- CD_NEW not-json -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['invalid-json'],
    });
});

test('27. name containing --> is rejected', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara-->injection","color":"#B86FD4"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['invalid-proposal-value'],
    });
});

test('28. proposal order is not numerically sorted', () => {
    const input = [
        '[c99]Oldest.[/c]',
        '[c1]Youngest.[/c]',
        '<!-- CD_NEW {"id":"c99","name":"Oldest","color":"#111111"} -->',
        '<!-- CD_NEW {"id":"c1","name":"Youngest","color":"#222222"} -->',
    ].join('\n');

    const result = parseRegistrationTrailer(input);

    assert.equal(result.ok, true);
    assert.equal(result.proposals[0].id, 'c99');
    assert.equal(result.proposals[1].id, 'c1');
});

test('29. the returned data does not expose mutable shared parser state between calls', () => {
    const input = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#123456"} -->',
    ].join('\n');

    const first = parseRegistrationTrailer(input);
    first.proposals.push({ id: 'c9', name: 'Fake', color: '#000000' });
    first.errors.push('fake-error');

    const second = parseRegistrationTrailer(input);

    assert.deepEqual(second, {
        ok: true,
        proposals: [
            {
                id: 'c1',
                name: 'Alice',
                color: '#123456',
            },
        ],
        errors: [],
    });
});

test('30. function never returns a Promise', () => {
    const result = parseRegistrationTrailer('Any message');

    assert.equal(result instanceof Promise, false);
    assert.equal(typeof result?.then, 'undefined');
});

test('malformed empty control comment is rejected safely', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- CD_NEW -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['malformed-control-record'],
    });
});

test('31. misplaced trailer where marker exists only after the control record returns only misplaced-control-record', () => {
    const input = [
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
        '[c2]Story after trailer.[/c]',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['misplaced-control-record'],
    });
});

test('32. multiline attempted CD_NEW comment with leading newline is rejected', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!--',
        'CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"}',
        '-->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['malformed-control-record'],
    });
});

test('33. CD_NEW followed by multiline JSON/comment closure is rejected with only malformed-control-record', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- CD_NEW',
        '{"id":"c2","name":"Mara","color":"#B86FD4"}',
        '-->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['malformed-control-record'],
    });
});

test('34. unrelated HTML comment that merely contains CD_NEW but does not start with it is ignored', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- This documentation mentions CD_NEW. -->',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: true,
        proposals: [
            {
                id: 'c2',
                name: 'Mara',
                color: '#B86FD4',
            },
        ],
        errors: [],
    });
});

test('35. Phase 1 structural/record failures short-circuit semantic validation', () => {
    const input = [
        'Visible text without any markers.',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
        '<!-- CD_NEW invalid-json -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['invalid-json'],
    });
});

test('36. Phase 1 value failures short-circuit duplicate detection', () => {
    const input = [
        '[c2]Hello.[/c]',
        '[c3]World.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"bad-color"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['invalid-proposal-value'],
    });
});

test('37. malformed multiline CD_NEW followed by later valid one-line CD_NEW returns only malformed-control-record', () => {
    const input = [
        '[c2]Hello.[/c]',
        '<!-- CD_NEW',
        '{"id":"c2","name":"Mara","color":"#B86FD4"}',
        '-->',
        '<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->',
    ].join('\n');

    assert.deepEqual(parseRegistrationTrailer(input), {
        ok: false,
        proposals: [],
        errors: ['malformed-control-record'],
    });
});