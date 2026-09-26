import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getRelativeLuminance,
    getContrastRatio,
    meetsContrastRequirement,
    adjustColorForContrast,
} from '../src/color-contrast.js';

const EPSILON = 1e-6;

test('1. Black relative luminance is 0', () => {
    assert.equal(getRelativeLuminance('#000000'), 0);
});

test('2. White relative luminance is 1', () => {
    assert.equal(getRelativeLuminance('#FFFFFF'), 1);
});

test('3. A known mid-color luminance calculation', () => {
    const redLum = getRelativeLuminance('#FF0000');
    assert.ok(Math.abs(redLum - 0.2126) < EPSILON);

    const greenLum = getRelativeLuminance('#00FF00');
    assert.ok(Math.abs(greenLum - 0.7152) < EPSILON);

    const blueLum = getRelativeLuminance('#0000FF');
    assert.ok(Math.abs(blueLum - 0.0722) < EPSILON);

    const grayLum = getRelativeLuminance('#808080');
    assert.ok(Math.abs(grayLum - 0.2158605) < 1e-4);
});

test('4. Invalid luminance color returns null', () => {
    for (const invalid of [
        null,
        undefined,
        '',
        '   ',
        '#ABC',
        '#12345',
        '#GGGGGG',
        123456,
        {},
        [],
    ]) {
        assert.equal(getRelativeLuminance(invalid), null);
    }
});

test('5. Black/white contrast is 21', () => {
    assert.equal(getContrastRatio('#000000', '#FFFFFF'), 21);
    assert.equal(getContrastRatio('#FFFFFF', '#000000'), 21);
});

test('6. Same-color contrast is 1', () => {
    assert.equal(getContrastRatio('#000000', '#000000'), 1);
    assert.equal(getContrastRatio('#FFFFFF', '#FFFFFF'), 1);
    assert.equal(getContrastRatio('#B86FD4', '#B86FD4'), 1);
});

test('7. Contrast calculation is symmetric', () => {
    const pairs = [
        ['#123456', '#ABCDEF'],
        ['#FF8800', '#001122'],
        ['#555555', '#AAAAAA'],
    ];

    for (const [c1, c2] of pairs) {
        const ratio1 = getContrastRatio(c1, c2);
        const ratio2 = getContrastRatio(c2, c1);
        assert.ok(Math.abs(ratio1 - ratio2) < EPSILON);
    }
});

test('8. Invalid foreground contrast returns null', () => {
    assert.equal(getContrastRatio('invalid', '#FFFFFF'), null);
    assert.equal(getContrastRatio(null, '#FFFFFF'), null);
    assert.equal(getContrastRatio('', '#000000'), null);
});

test('9. Invalid background contrast returns null', () => {
    assert.equal(getContrastRatio('#FFFFFF', 'invalid'), null);
    assert.equal(getContrastRatio('#FFFFFF', null), null);
    assert.equal(getContrastRatio('#000000', '#12345'), null);
});

test('10. Default minimum is 4.5', () => {
    assert.equal(meetsContrastRequirement('#000000', '#FFFFFF'), true);
    assert.equal(
        meetsContrastRequirement('#000000', '#FFFFFF'),
        meetsContrastRequirement('#000000', '#FFFFFF', 4.5),
    );
});

test('11. A passing color meets requirement', () => {
    assert.equal(meetsContrastRequirement('#000000', '#FFFFFF', 4.5), true);
    assert.equal(meetsContrastRequirement('#FFFFFF', '#000000', 7.0), true);
});

test('12. A failing color does not meet requirement', () => {
    assert.equal(meetsContrastRequirement('#E0E0E0', '#FFFFFF', 4.5), false);
    assert.equal(meetsContrastRequirement('#202020', '#101010', 4.5), false);
});

test('13. Invalid minimum ratios fail safely', () => {
    for (const invalidRatio of [
        0,
        0.99,
        21.01,
        25,
        -1,
        NaN,
        Infinity,
        -Infinity,
        '4.5',
        null,
        {},
    ]) {
        assert.equal(
            meetsContrastRequirement('#000000', '#FFFFFF', invalidRatio),
            false,
        );
    }
});

test('explicit undefined minimum uses the default 4.5', () => {
    assert.equal(
        meetsContrastRequirement('#777777', '#FFFFFF', undefined),
        meetsContrastRequirement('#777777', '#FFFFFF', 4.5),
    );

    assert.deepEqual(
        adjustColorForContrast('#777777', '#FFFFFF', undefined),
        adjustColorForContrast('#777777', '#FFFFFF', 4.5),
    );
});

test('14. Already-passing foreground is normalized but unchanged semantically', () => {
    const result = adjustColorForContrast(' #000000 ', ' #ffffff ', 4.5);
    assert.equal(result.ok, true);
    assert.equal(result.color, '#000000');
});

test('15. Already-passing result has changed=false and direction=none', () => {
    const result = adjustColorForContrast('#000000', '#FFFFFF', 4.5);
    assert.deepEqual(result, {
        ok: true,
        color: '#000000',
        ratio: 21,
        changed: false,
        direction: 'none',
        error: null,
    });
});

test('16. Dark foreground on dark background is repaired lighter when appropriate', () => {
    const result = adjustColorForContrast('#202020', '#101010', 4.5);
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(result.direction, 'lighter');
    assert.equal(result.error, null);
    assert.ok(result.ratio >= 4.5);
});

test('17. Light foreground on light background is repaired darker when appropriate', () => {
    const result = adjustColorForContrast('#E0E0E0', '#F0F0F0', 4.5);
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(result.direction, 'darker');
    assert.equal(result.error, null);
    assert.ok(result.ratio >= 4.5);
});

test('18. Repaired result actually meets target', () => {
    const result = adjustColorForContrast('#555555', '#444444', 5.0);
    assert.equal(result.ok, true);
    assert.ok(result.ratio >= 5.0);
});

test('19. Returned ratio matches the returned foreground/background colors', () => {
    const result = adjustColorForContrast('#404040', '#202020', 4.5);
    assert.equal(result.ok, true);
    const expectedRatio = getContrastRatio(result.color, '#202020');
    assert.equal(result.ratio, expectedRatio);
});

test('20. Lowercase foreground/background are accepted through existing normalization', () => {
    const result = adjustColorForContrast(' #1a2b3c ', ' #fafafa ', 4.5);
    assert.equal(result.ok, true);
    assert.equal(result.color, '#1A2B3C');
});

test('21. Invalid foreground produces invalid-foreground', () => {
    for (const invalid of [null, '', '#XYZ', '123456']) {
        const result = adjustColorForContrast(invalid, '#FFFFFF', 4.5);
        assert.deepEqual(result, {
            ok: false,
            color: null,
            ratio: null,
            changed: false,
            direction: null,
            error: 'invalid-foreground',
        });
    }
});

test('22. Invalid background produces invalid-background', () => {
    for (const invalid of [null, '', '#XYZ', '123456']) {
        const result = adjustColorForContrast('#FFFFFF', invalid, 4.5);
        assert.deepEqual(result, {
            ok: false,
            color: null,
            ratio: null,
            changed: false,
            direction: null,
            error: 'invalid-background',
        });
    }
});

test('23. Invalid target produces invalid-minimum-ratio', () => {
    for (const invalidRatio of [0.5, 21.5, NaN, Infinity, -Infinity, '4.5', null]) {
        const result = adjustColorForContrast('#000000', '#FFFFFF', invalidRatio);
        assert.deepEqual(result, {
            ok: false,
            color: null,
            ratio: null,
            changed: false,
            direction: null,
            error: 'invalid-minimum-ratio',
        });
    }
});

test('24. A deliberately unreachable high target produces unreachable', () => {
    const result = adjustColorForContrast('#808080', '#808080', 10.0);
    assert.deepEqual(result, {
        ok: false,
        color: null,
        ratio: null,
        changed: false,
        direction: null,
        error: 'unreachable',
    });
});

test('25. When both lighter and darker are possible, nearest RGB-distance candidate wins', () => {
    // #777777 background can achieve 3.0 contrast either going lighter or darker.
    // #858585 is already lighter than #777777, so the lighter candidate is closer in distance.
    const resultLighter = adjustColorForContrast('#858585', '#777777', 3.0);
    assert.equal(resultLighter.ok, true);
    assert.equal(resultLighter.direction, 'lighter');

    // #656565 is already darker than #777777, so the darker candidate is closer in distance.
    const resultDarker = adjustColorForContrast('#656565', '#777777', 3.0);
    assert.equal(resultDarker.ok, true);
    assert.equal(resultDarker.direction, 'darker');
});

test('26. Tie behavior is deterministic', () => {
    const res1 = adjustColorForContrast('#606060', '#777777', 3.5);
    const res2 = adjustColorForContrast('#606060', '#777777', 3.5);
    assert.deepEqual(res1, res2);
});

test('27. Repeated calls produce equivalent results', () => {
    const cases = [
        ['#123456', '#654321', 4.5],
        ['#FFFFFF', '#FFFFFF', 4.5],
        ['#000000', '#000000', 4.5],
        ['#B86FD4', '#222222', 4.5],
    ];

    for (const [fg, bg, ratio] of cases) {
        const first = adjustColorForContrast(fg, bg, ratio);
        const second = adjustColorForContrast(fg, bg, ratio);
        assert.deepEqual(first, second);
    }
});

test('28. Adjustment does not jump immediately to pure black/white when a closer passing intermediate exists', () => {
    const result = adjustColorForContrast('#777777', '#FFFFFF', 4.5);
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(result.direction, 'darker');
    assert.notEqual(result.color, '#000000');
    assert.notEqual(result.color, '#FFFFFF');
    assert.ok(result.ratio >= 4.5);
});

test('29. Edge target 1 behaves correctly', () => {
    const result = adjustColorForContrast('#B86FD4', '#B86FD4', 1);
    assert.deepEqual(result, {
        ok: true,
        color: '#B86FD4',
        ratio: 1,
        changed: false,
        direction: 'none',
        error: null,
    });
});

test('30. Edge target 21 behaves correctly where possible', () => {
    const passing = adjustColorForContrast('#000000', '#FFFFFF', 21);
    assert.deepEqual(passing, {
        ok: true,
        color: '#000000',
        ratio: 21,
        changed: false,
        direction: 'none',
        error: null,
    });

    const repaired = adjustColorForContrast('#111111', '#000000', 21);
    assert.deepEqual(repaired, {
        ok: true,
        color: '#FFFFFF',
        ratio: 21,
        changed: true,
        direction: 'lighter',
        error: null,
    });

    const unreachable = adjustColorForContrast('#808080', '#777777', 21);
    assert.equal(unreachable.ok, false);
    assert.equal(unreachable.error, 'unreachable');
});

test('31. Requested ratio slightly above current contrast triggers repair', () => {
    const fg = '#333333';
    const bg = '#FFFFFF';
    const current = getContrastRatio(fg, bg);
    const result = adjustColorForContrast(fg, bg, current + 0.5);

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.ok(result.ratio >= current + 0.5);
});

test('32. Requested ratio equal to current contrast does not unnecessarily change the color', () => {
    const fg = '#404040';
    const bg = '#FFFFFF';
    const current = getContrastRatio(fg, bg);
    const result = adjustColorForContrast(fg, bg, current);

    assert.equal(result.ok, true);
    assert.equal(result.changed, false);
    assert.equal(result.color, '#404040');
    assert.equal(result.direction, 'none');
});

test('33. Result colors always use canonical uppercase #RRGGBB', () => {
    const hexPattern = /^#[0-9A-F]{6}$/;

    const res1 = adjustColorForContrast('#abcdef', '#111111', 4.5);
    assert.ok(hexPattern.test(res1.color));

    const res2 = adjustColorForContrast('#222222', '#111111', 4.5);
    assert.ok(hexPattern.test(res2.color));
});

test('34. Public functions are synchronous and never return Promises', () => {
    const lum = getRelativeLuminance('#000000');
    const contrast = getContrastRatio('#000000', '#FFFFFF');
    const meets = meetsContrastRequirement('#000000', '#FFFFFF');
    const adjusted = adjustColorForContrast('#000000', '#FFFFFF');

    assert.ok(!(lum instanceof Promise));
    assert.ok(!(contrast instanceof Promise));
    assert.ok(!(meets instanceof Promise));
    assert.ok(!(adjusted instanceof Promise));
});

test('35. No DOM or SillyTavern dependency is required', () => {
    assert.equal(typeof globalThis.window, 'undefined');
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.SillyTavern, 'undefined');
});