import test from 'node:test';
import assert from 'node:assert/strict';

import { scanLegacyDialogue } from '../src/legacy-dialogue-scanner.js';

test('1. non-string inputs return status invalid-message with empty arrays', () => {
    const invalidInputs = [null, undefined, 42, {}, [], true, Symbol('msg')];

    for (const input of invalidInputs) {
        const result = scanLegacyDialogue(input);
        assert.deepEqual(result, {
            status: 'invalid-message',
            candidates: [],
            issues: [],
        });
    }
});

test('2. empty string returns ready status with empty candidates and issues', () => {
    const result = scanLegacyDialogue('');
    assert.deepEqual(result, {
        status: 'ready',
        candidates: [],
        issues: [],
    });
});

test('3. whitespace-only and ordinary prose without legacy markup produce no candidates or issues', () => {
    const whitespaceResult = scanLegacyDialogue('   \n  \t  \n');
    assert.deepEqual(whitespaceResult, {
        status: 'ready',
        candidates: [],
        issues: [],
    });

    const proseResult = scanLegacyDialogue('The cold wind howled across the deserted courtyard.');
    assert.deepEqual(proseResult, {
        status: 'ready',
        candidates: [],
        issues: [],
    });
});

test('4. plain straight quoted dialogue without color wrapper produces zero candidates', () => {
    const result = scanLegacyDialogue('Alice said, "Hello there." And Bob replied, "Good morning."');
    assert.deepEqual(result, {
        status: 'ready',
        candidates: [],
        issues: [],
    });
});

test('5. plain curly quoted dialogue without color wrapper produces zero candidates', () => {
    const result = scanLegacyDialogue('Alice said, “Hello there.” And Bob replied, “Good morning.”');
    assert.deepEqual(result, {
        status: 'ready',
        candidates: [],
        issues: [],
    });
});

test('6. markdown emphasis and formatting without color wrapper produce zero candidates', () => {
    const result = scanLegacyDialogue('*Italics* **Bold** _Underscore_ ***Both*** `code`');
    assert.deepEqual(result, {
        status: 'ready',
        candidates: [],
        issues: [],
    });
});

test('7. scanLegacyDialogue never mutates input string or any argument', () => {
    const input = '<gold>"Hello."</gold>';
    const snapshot = input.slice();

    const result = scanLegacyDialogue(input);
    assert.equal(input, snapshot);
    assert.equal(result.status, 'ready');
});

test('8. returned results, candidate objects, ranges, and issues are fresh across calls', () => {
    const input = '<gold>"First."</gold>';
    const first = scanLegacyDialogue(input);
    const second = scanLegacyDialogue(input);

    assert.notEqual(first, second);
    assert.notEqual(first.candidates, second.candidates);
    assert.notEqual(first.candidates[0], second.candidates[0]);
    assert.notEqual(first.candidates[0].range, second.candidates[0].range);

    first.candidates[0].content = 'mutated';
    first.candidates[0].range.start = 999;
    first.issues.push({ code: 'fake', adapter: 'ff-named-color', raw: '', range: { start: 0, end: 0 } });

    assert.equal(second.candidates[0].content, 'First.');
    assert.equal(second.candidates[0].range.start, 0);
    assert.equal(second.issues.length, 0);
});

test('9. all ten accepted FF palette colors recognized in normal format', () => {
    const palette = [
        'cyan',
        'pink',
        'teal',
        'orange',
        'gold',
        'violet',
        'salmon',
        'orchid',
        'yellow',
        'plum',
    ];

    for (const color of palette) {
        const input = `<${color}>"Speaking in ${color}."</${color}>`;
        const result = scanLegacyDialogue(input);

        assert.equal(result.status, 'ready');
        assert.equal(result.candidates.length, 1);
        assert.equal(result.candidates[0].adapter, 'ff-named-color');
        assert.equal(result.candidates[0].sourceType, 'named');
        assert.equal(result.candidates[0].sourceValue, color);
        assert.equal(result.candidates[0].sourceKey, `named:${color}`);
        assert.equal(result.candidates[0].tone, null);
        assert.equal(result.candidates[0].classification, 'spoken');
        assert.equal(result.candidates[0].migratable, true);
        assert.equal(result.candidates[0].content, `Speaking in ${color}.`);
    }
});

test('10. FF normal/no-tone format sets tone to null, sourceType to named, and sourceKey to named:color', () => {
    const input = '<gold>"Hello world."</gold>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.adapter, 'ff-named-color');
    assert.equal(c.sourceType, 'named');
    assert.equal(c.sourceValue, 'gold');
    assert.equal(c.sourceKey, 'named:gold');
    assert.equal(c.tone, null);
    assert.equal(c.migratable, true);
});

test('11. all four canonical tones recognized for FF adapter', () => {
    const tones = ['whisper', 'shout', 'measured', 'tremble'];

    for (const tone of tones) {
        const input = `<teal:${tone}>"A tone test."</teal:${tone}>`;
        const result = scanLegacyDialogue(input);

        assert.equal(result.status, 'ready');
        assert.equal(result.candidates.length, 1);
        assert.equal(result.candidates[0].adapter, 'ff-named-color');
        assert.equal(result.candidates[0].tone, tone);
        assert.equal(result.candidates[0].migratable, true);
        assert.equal(result.candidates[0].classification, 'spoken');
        assert.equal(result.issues.length, 0);
    }
});

test('12. uppercase and mixed-case read normalization for FF palette colors and tones', () => {
    const input = '<GOLD:Whisper>"Quiet words."</gold:whisper>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.sourceValue, 'gold');
    assert.equal(c.sourceKey, 'named:gold');
    assert.equal(c.tone, 'whisper');
    assert.equal(c.migratable, true);
});

test('13. straight double quotes inside FF wrapper classified as spoken with quotes stripped', () => {
    const input = '<gold>"Direct speech."</gold>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.classification, 'spoken');
    assert.equal(c.quoteStyle, 'straight-double');
    assert.equal(c.content, 'Direct speech.');
    assert.equal(c.migratable, true);
});

test('14. curly double quotes inside FF wrapper classified as spoken with quotes stripped', () => {
    const input = '<gold>“Direct curly speech.”</gold>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.classification, 'spoken');
    assert.equal(c.quoteStyle, 'curly-double');
    assert.equal(c.content, 'Direct curly speech.');
    assert.equal(c.migratable, true);
});

test('15. FF wrapper immediately surrounded by straight outer quotes recognized as spoken', () => {
    const input = '"<gold>Outside quotes.</gold>"';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.classification, 'spoken');
    assert.equal(c.quoteStyle, 'straight-double');
    assert.equal(c.content, 'Outside quotes.');
    assert.equal(c.range.start, 0);
    assert.equal(c.range.end, input.length);
    assert.equal(c.raw, input);
    assert.equal(c.migratable, true);
});

test('16. FF wrapper immediately surrounded by curly outer quotes recognized as spoken', () => {
    const input = '“<gold>Outside curly quotes.</gold>”';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.classification, 'spoken');
    assert.equal(c.quoteStyle, 'curly-double');
    assert.equal(c.content, 'Outside curly quotes.');
    assert.equal(c.range.start, 0);
    assert.equal(c.range.end, input.length);
    assert.equal(c.raw, input);
    assert.equal(c.migratable, true);
});

test('17. multiline dialogue inside FF wrapper preserves newline content', () => {
    const input = '<gold>"Line one.\nLine two."</gold>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].content, 'Line one.\nLine two.');
    assert.equal(result.candidates[0].migratable, true);
});

test('18. nested formatting inside FF wrapper preserved in content', () => {
    const input = '<gold>"<i>Hello</i> <b>there</b>."</gold>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].content, '<i>Hello</i> <b>there</b>.');
    assert.equal(result.candidates[0].migratable, true);
});

test('19. FF wrapper without quotes classified as unknown-colored-content and not migratable', () => {
    const input = '<gold>Unquoted colored remark.</gold>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.classification, 'unknown-colored-content');
    assert.equal(c.migratable, false);
    assert.equal(c.quoteStyle, null);
    assert.equal(c.content, 'Unquoted colored remark.');
    assert.equal(result.issues.length, 0);
});

test('20. unknown palette names ignored entirely', () => {
    const input = '<red>"Hello."</red> <blue>"World."</blue> <green>"Test."</green>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 0);
    assert.equal(result.issues.length, 0);
});

test('21. :normal tone on FF wrapper rejected with unsupported-tone issue and no candidate', () => {
    const input = '<gold:normal>"Ordinary tone."</gold:normal>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 0);
    assert.equal(result.issues.length, 1);
    assert.deepEqual(result.issues[0], {
        code: 'unsupported-tone',
        adapter: 'ff-named-color',
        raw: '<gold:normal>"Ordinary tone."</gold:normal>',
        range: {
            start: 0,
            end: input.length,
        },
    });
});

test('22. arbitrary unsupported tones produce unsupported-tone issue', () => {
    const inputs = [
        '<gold:angry>"Angry tone."</gold:angry>',
        '<gold:playful>"Playful tone."</gold:playful>',
        '<gold:staccato>"Staccato tone."</gold:staccato>',
    ];

    for (const input of inputs) {
        const result = scanLegacyDialogue(input);
        assert.equal(result.candidates.length, 0);
        assert.equal(result.issues.length, 1);
        assert.equal(result.issues[0].code, 'unsupported-tone');
        assert.equal(result.issues[0].adapter, 'ff-named-color');
    }
});

test('23. mismatched closing tag color or tone is not recognized as a migration candidate', () => {
    const inputs = [
        '<gold>"Hello."</teal>',
        '<gold:whisper>"Hello."</gold>',
        '<gold>"Hello."</gold:whisper>',
        '<gold:whisper>"Hello."</gold:shout>',
    ];

    for (const input of inputs) {
        const result = scanLegacyDialogue(input);
        assert.equal(result.candidates.length, 0);
        assert.equal(result.issues.length, 0);
    }
});

test('24. double-quoted six-digit hex color attribute with leading # recognized', () => {
    const input = '<font color="#56B4E9">"Hello."</font>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.adapter, 'html-font-color');
    assert.equal(c.sourceType, 'hex');
    assert.equal(c.sourceValue, '#56B4E9');
    assert.equal(c.sourceKey, 'hex:#56B4E9');
    assert.equal(c.tone, null);
    assert.equal(c.migratable, true);
    assert.equal(c.content, 'Hello.');
});

test('25. single-quoted six-digit hex color attribute with leading # recognized', () => {
    const input = "<font color='#56B4E9'>\"Hello.\"</font>";
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].sourceValue, '#56B4E9');
    assert.equal(result.candidates[0].sourceKey, 'hex:#56B4E9');
});

test('26. unquoted six-digit hex color attribute with leading # recognized', () => {
    const input = '<font color=#56B4E9>"Hello."</font>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].sourceValue, '#56B4E9');
    assert.equal(result.candidates[0].sourceKey, 'hex:#56B4E9');
});

test('27. six hex digits without leading hash normalized to uppercase leading #', () => {
    const inputs = [
        '<font color="56B4E9">"Double quoted."</font>',
        "<font color='56B4E9'>\"Single quoted.\"</font>",
        '<font color=56B4E9>"Unquoted."</font>',
    ];

    for (const input of inputs) {
        const result = scanLegacyDialogue(input);
        assert.equal(result.candidates.length, 1);
        assert.equal(result.candidates[0].sourceValue, '#56B4E9');
        assert.equal(result.candidates[0].sourceKey, 'hex:#56B4E9');
    }
});

test('28. lowercase hex digits normalized to uppercase #RRGGBB', () => {
    const input = '<font color="#56b4e9">"Lowercase color."</font>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].sourceValue, '#56B4E9');
    assert.equal(result.candidates[0].sourceKey, 'hex:#56B4E9');
});

test('29. case-insensitive FONT tag and COLOR attribute names accepted', () => {
    const input = '<FONT COLOR="#56B4E9">"Uppercase tag."</FONT>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].adapter, 'html-font-color');
    assert.equal(result.candidates[0].sourceValue, '#56B4E9');
});

test('30. straight quotes inside font wrapper classified as spoken with quotes stripped', () => {
    const input = '<font color="#56B4E9">"Inside straight quotes."</font>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.classification, 'spoken');
    assert.equal(c.quoteStyle, 'straight-double');
    assert.equal(c.content, 'Inside straight quotes.');
    assert.equal(c.migratable, true);
});

test('31. curly quotes inside font wrapper classified as spoken with quotes stripped', () => {
    const input = '<font color="#56B4E9">“Inside curly quotes.”</font>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.classification, 'spoken');
    assert.equal(c.quoteStyle, 'curly-double');
    assert.equal(c.content, 'Inside curly quotes.');
    assert.equal(c.migratable, true);
});

test('32. Nemo-style straight double quotes outside font wrapper classified as spoken', () => {
    const input = '"<font color="#56B4E9">Outside straight quotes.</font>"';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.classification, 'spoken');
    assert.equal(c.quoteStyle, 'straight-double');
    assert.equal(c.content, 'Outside straight quotes.');
    assert.equal(c.migratable, true);
});

test('33. Nemo-style curly double quotes outside font wrapper classified as spoken', () => {
    const input = '“<font color="#56B4E9">Outside curly quotes.</font>”';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.classification, 'spoken');
    assert.equal(c.quoteStyle, 'curly-double');
    assert.equal(c.content, 'Outside curly quotes.');
    assert.equal(c.migratable, true);
});

test('34. Nemo-style outer quotes range and raw include the quotation marks', () => {
    const input = 'Prefix "<font color="#56B4E9">Delimited content.</font>" Suffix';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.raw, '"<font color="#56B4E9">Delimited content.</font>"');
    assert.equal(c.range.start, 7);
    assert.equal(c.range.end, 7 + c.raw.length);
    assert.equal(input.slice(c.range.start, c.range.end), c.raw);
});

test('35. font wrapper without quotes classified as unknown-colored-content and not migratable', () => {
    const input = '<font color="#56B4E9">I should not say this.</font>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.classification, 'unknown-colored-content');
    assert.equal(c.migratable, false);
    assert.equal(c.quoteStyle, null);
    assert.equal(c.content, 'I should not say this.');
    assert.equal(result.issues.length, 0);
});

test('36. nested HTML formatting and multiline content inside font wrapper preserved', () => {
    const input = '<font color="#56B4E9">"Line 1 with <i>nested</i> text.\nLine 2."</font>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].content, 'Line 1 with <i>nested</i> text.\nLine 2.');
    assert.equal(result.candidates[0].migratable, true);
});

test('37. invalid font colors and extra font attributes rejected', () => {
    const invalidInputs = [
        '<font color="#ABC">"Short hex."</font>',
        '<font color="#GGGGGG">"Invalid hex."</font>',
        '<font color="red">"Named color."</font>',
        '<font color="rgb(0,0,0)">"RGB color."</font>',
        '<font color="#1234567">"Seven digit hex."</font>',
        '<font color="#56B4E9" face="Arial">"Extra face attribute."</font>',
        '<font size="3" color="#56B4E9">"Extra size attribute."</font>',
        '<font style="color:#56B4E9">"Extra style attribute."</font>',
    ];

    for (const input of invalidInputs) {
        const result = scanLegacyDialogue(input);
        assert.equal(result.candidates.length, 0, `Expected 0 candidates for: ${input}`);
        assert.equal(result.issues.length, 0);
    }
});

test('38. exact DEM syntax with style attribute and six-digit hex color recognized', () => {
    const input = '<span style="color:#56B4E9">"Hello from DEM."</span>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.adapter, 'inline-css-color');
    assert.equal(c.sourceType, 'hex');
    assert.equal(c.sourceValue, '#56B4E9');
    assert.equal(c.sourceKey, 'hex:#56B4E9');
    assert.equal(c.tone, null);
    assert.equal(c.classification, 'spoken');
    assert.equal(c.migratable, true);
    assert.equal(c.content, 'Hello from DEM.');
});

test('39. harmless whitespace around CSS property and value accepted in DEM span', () => {
    const input = '<span style=" color : #56B4E9 ">"Spaced style."</span>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].sourceValue, '#56B4E9');
    assert.equal(result.candidates[0].migratable, true);
});

test('40. optional trailing semicolon accepted in style attribute of DEM span', () => {
    const input = '<span style="color:#56B4E9;">"Trailing semicolon."</span>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].sourceValue, '#56B4E9');
    assert.equal(result.candidates[0].migratable, true);
});

test('41. single-quoted style attribute and case-insensitive SPAN/STYLE/COLOR accepted', () => {
    const input = "<SPAN STYLE=' COLOR : #56b4e9; '>\"Single quotes.\"</SPAN>";
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].adapter, 'inline-css-color');
    assert.equal(result.candidates[0].sourceValue, '#56B4E9');
    assert.equal(result.candidates[0].sourceKey, 'hex:#56B4E9');
    assert.equal(result.candidates[0].migratable, true);
});

test('42. straight and curly quoted dialogue inside DEM span classified as spoken', () => {
    const straightInput = '<span style="color:#56B4E9">"Straight."</span>';
    const curlyInput = '<span style="color:#56B4E9">“Curly.”</span>';

    const straightResult = scanLegacyDialogue(straightInput);
    assert.equal(straightResult.candidates[0].quoteStyle, 'straight-double');
    assert.equal(straightResult.candidates[0].content, 'Straight.');

    const curlyResult = scanLegacyDialogue(curlyInput);
    assert.equal(curlyResult.candidates[0].quoteStyle, 'curly-double');
    assert.equal(curlyResult.candidates[0].content, 'Curly.');
});

test('43. DEM span without quotes classified as unknown-colored-content and not migratable', () => {
    const input = '<span style="color:#56B4E9">Unquoted span text.</span>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.classification, 'unknown-colored-content');
    assert.equal(c.migratable, false);
    assert.equal(c.quoteStyle, null);
    assert.equal(c.content, 'Unquoted span text.');
});

test('44. extra CSS declarations, additional HTML attributes, named colors, and non-span elements rejected', () => {
    const invalidInputs = [
        '<span style="color:#56B4E9;font-weight:bold">"Extra CSS."</span>',
        '<span style="font-style:italic;color:#56B4E9">"Leading CSS."</span>',
        '<span class="foo" style="color:#56B4E9">"Extra class."</span>',
        '<span id="bar" style="color:#56B4E9">"Extra id."</span>',
        '<span style="color:red">"Named color."</span>',
        '<span style="color:rgb(0,0,0)">"RGB color."</span>',
        '<span style="color:#ABC">"Short hex."</span>',
        '<div style="color:#56B4E9">"Div element."</div>',
        '<p style="color:#56B4E9">"Paragraph element."</p>',
    ];

    for (const input of invalidInputs) {
        const result = scanLegacyDialogue(input);
        assert.equal(result.candidates.length, 0, `Expected 0 candidates for: ${input}`);
        assert.equal(result.issues.length, 0);
    }
});

test('45. multiple independent candidates across different adapters retain source order', () => {
    const input = [
        '<gold>"First line."</gold>',
        'Narrative between.',
        '<font color="#56B4E9">"Second line."</font>',
        'More narrative.',
        '<span style="color:#B86FD4">"Third line."</span>',
    ].join('\n');

    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 3);
    assert.equal(result.candidates[0].adapter, 'ff-named-color');
    assert.equal(result.candidates[0].content, 'First line.');
    assert.equal(result.candidates[1].adapter, 'html-font-color');
    assert.equal(result.candidates[1].content, 'Second line.');
    assert.equal(result.candidates[2].adapter, 'inline-css-color');
    assert.equal(result.candidates[2].content, 'Third line.');

    assert.ok(result.candidates[0].range.start < result.candidates[1].range.start);
    assert.ok(result.candidates[1].range.start < result.candidates[2].range.start);
});

test('46. same normalized hex across HTML font and DEM inline CSS produces identical sourceKey', () => {
    const input = '<font color="#56b4e9">"A"</font> and <span style="color:#56B4E9">"B"</span>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].sourceKey, 'hex:#56B4E9');
    assert.equal(result.candidates[1].sourceKey, 'hex:#56B4E9');
    assert.equal(result.candidates[0].sourceKey, result.candidates[1].sourceKey);
});

test('47. unrelated existing complete CD regions elsewhere in message do not block candidates', () => {
    const input = '[c1]Already migrated speech.[/c]\n\n<font color="#56B4E9">"Legacy dialogue."</font>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].adapter, 'html-font-color');
    assert.equal(result.candidates[0].content, 'Legacy dialogue.');
    assert.equal(result.issues.length, 0);
});

test('48. candidate overlapping complete existing CD region produces overlaps-existing-cd issue and is not returned', () => {
    const input = '[c1]<font color="#56B4E9">"Nested speech inside CD."</font>[/c]';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 0);
    assert.equal(result.issues.length, 1);
    assert.deepEqual(result.issues[0], {
        code: 'overlaps-existing-cd',
        adapter: 'html-font-color',
        raw: '<font color="#56B4E9">"Nested speech inside CD."</font>',
        range: {
            start: 4,
            end: 4 + '<font color="#56B4E9">"Nested speech inside CD."</font>'.length,
        },
    });
});

test('49. nested and overlapping legacy markup produces overlapping-legacy-markup issue and disqualifies candidates', () => {
    const input = '<span style="color:#56B4E9"><font color="#56B4E9">"Nested legacy dialogue."</font></span>';
    const result = scanLegacyDialogue(input);

    assert.equal(result.candidates.length, 0);
    assert.equal(result.issues.length, 2);

    assert.equal(result.issues[0].code, 'overlapping-legacy-markup');
    assert.equal(result.issues[0].adapter, 'inline-css-color');
    assert.equal(result.issues[0].raw, input);

    assert.equal(result.issues[1].code, 'overlapping-legacy-markup');
    assert.equal(result.issues[1].adapter, 'html-font-color');
    assert.equal(result.issues[1].raw, '<font color="#56B4E9">"Nested legacy dialogue."</font>');
});

test('50. candidate and issue objects satisfy exact raw/range invariant, deterministic ordering, and exact specified property shapes', () => {
    const input = [
        '<gold:normal>"Unsupported tone."</gold:normal>',
        '<gold>"Valid speech."</gold>',
        '[c2]<font color="#123456">"Inside CD."</font>[/c]',
    ].join('\n');

    const result = scanLegacyDialogue(input);

    const expectedCandidateKeys = [
        'adapter',
        'classification',
        'content',
        'migratable',
        'quoteStyle',
        'range',
        'raw',
        'sourceKey',
        'sourceType',
        'sourceValue',
        'tone',
    ];

    for (const c of result.candidates) {
        assert.deepEqual(Object.keys(c).sort(), expectedCandidateKeys);
        assert.deepEqual(Object.keys(c.range).sort(), ['end', 'start']);
        assert.equal(input.slice(c.range.start, c.range.end), c.raw);
    }

    const expectedIssueKeys = ['adapter', 'code', 'range', 'raw'];

    for (const issue of result.issues) {
        assert.deepEqual(Object.keys(issue).sort(), expectedIssueKeys);
        assert.deepEqual(Object.keys(issue.range).sort(), ['end', 'start']);
        assert.equal(input.slice(issue.range.start, issue.range.end), issue.raw);
    }

    for (let i = 1; i < result.candidates.length; i += 1) {
        assert.ok(result.candidates[i - 1].range.start <= result.candidates[i].range.start);
    }

    for (let i = 1; i < result.issues.length; i += 1) {
        assert.ok(result.issues[i - 1].range.start <= result.issues[i].range.start);
    }
});