import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRuntimeOptions } from '../src/runtime-options.js';

const originalDocument = globalThis.document;
const originalGetComputedStyle = globalThis.getComputedStyle;

test.afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.getComputedStyle = originalGetComputedStyle;
});

function setupMockDom({
    mesText = null,
    chat = null,
    docElement = null,
    body = null,
    throwOn = null,
    throwAlways = false,
} = {}) {
    globalThis.document = {
        documentElement: docElement,
        body,
        querySelector(selector) {
            if (selector === '#chat .mes_text') {
                return mesText;
            }
            if (selector === '#chat') {
                return chat;
            }
            return null;
        },
    };

    globalThis.getComputedStyle = (el) => {
        if (throwAlways || (throwOn && el === throwOn)) {
            throw new Error('Computed style unavailable');
        }

        return {
            backgroundColor: el?.style?.backgroundColor || 'rgba(0, 0, 0, 0)',
            getPropertyValue(name) {
                return el?.style?.customProperties?.[name] || '';
            },
        };
    };
}

test('1. Missing document -> dom-unavailable', () => {
    delete globalThis.document;
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(0, 0, 0)' });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'unavailable',
        reason: 'dom-unavailable',
    });
});

test('2. Missing getComputedStyle -> dom-unavailable', () => {
    globalThis.document = {
        querySelector: () => null,
    };
    delete globalThis.getComputedStyle;

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'unavailable',
        reason: 'dom-unavailable',
    });
});

test('3. Missing #chat and message element -> chat-element-missing', () => {
    setupMockDom({ mesText: null, chat: null });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'unavailable',
        reason: 'chat-element-missing',
    });
});

test('4. Existing .mes_text opaque rgb background -> ready', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(24, 48, 72)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'ready',
        options: {
            backgroundColor: '#183048',
            minimumContrast: 4.5,
        },
    });
});

test('5. Existing #chat fallback opaque background -> ready', () => {
    const chat = {
        parentElement: null,
        style: { backgroundColor: 'rgb(10, 20, 30)' },
    };
    setupMockDom({ mesText: null, chat });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'ready',
        options: {
            backgroundColor: '#0A141E',
            minimumContrast: 4.5,
        },
    });
});

test('6. rgb values normalize to uppercase hex', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(171, 205, 239)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#ABCDEF');
});

test('7. rgba alpha 1 works as opaque', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgba(18, 52, 86, 1)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'ready',
        options: {
            backgroundColor: '#123456',
            minimumContrast: 4.5,
        },
    });
});

test('8. transparent/alpha 0 child walks to parent', () => {
    const parent = {
        parentElement: null,
        style: { backgroundColor: 'rgb(50, 50, 50)' },
    };
    const child = {
        parentElement: parent,
        style: { backgroundColor: 'transparent' },
    };
    setupMockDom({ mesText: child });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#323232');

    child.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    const result2 = resolveRuntimeOptions();
    assert.equal(result2.status, 'ready');
    assert.equal(result2.options.backgroundColor, '#323232');
});

test('9. Multiple transparent ancestors walk correctly', () => {
    const grandparent = {
        parentElement: null,
        style: { backgroundColor: 'rgb(100, 100, 100)' },
    };
    const parent = {
        parentElement: grandparent,
        style: { backgroundColor: 'rgba(0, 0, 0, 0)' },
    };
    const child = {
        parentElement: parent,
        style: { backgroundColor: 'transparent' },
    };
    setupMockDom({ mesText: child });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#646464');
});

test('10. Semi-transparent child composites over opaque parent', () => {
    const parent = {
        parentElement: null,
        style: { backgroundColor: 'rgb(0, 0, 0)' },
    };
    const child = {
        parentElement: parent,
        style: { backgroundColor: 'rgba(255, 0, 0, 0.5)' },
    };
    setupMockDom({ mesText: child });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#800000');
});

test('11. Multiple semi-transparent layers composite correctly', () => {
    const grandparent = {
        parentElement: null,
        style: { backgroundColor: 'rgb(0, 0, 0)' },
    };
    const parent = {
        parentElement: grandparent,
        style: { backgroundColor: 'rgba(255, 255, 255, 0.5)' },
    };
    const child = {
        parentElement: parent,
        style: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
    };
    setupMockDom({ mesText: child });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#404040');
});

test('12. White 50% over black resolves approximately #808080', () => {
    const parent = {
        parentElement: null,
        style: { backgroundColor: 'rgb(0, 0, 0)' },
    };
    const child = {
        parentElement: parent,
        style: { backgroundColor: 'rgba(255, 255, 255, 0.5)' },
    };
    setupMockDom({ mesText: child });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#808080');
});

test('13. Space-separated rgb syntax supported', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(24 24 24)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#181818');
});

test('14. Space-separated rgb with slash alpha supported', () => {
    const parent = {
        parentElement: null,
        style: { backgroundColor: 'rgb(0 0 0)' },
    };
    const child = {
        parentElement: parent,
        style: { backgroundColor: 'rgb(255 255 255 / 0.5)' },
    };
    setupMockDom({ mesText: child });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#808080');
});

test('15. Unsupported computed color on child continues upward', () => {
    const parent = {
        parentElement: null,
        style: { backgroundColor: 'rgb(40, 40, 40)' },
    };
    const child = {
        parentElement: parent,
        style: { backgroundColor: 'hsl(120, 100%, 50%)' },
    };
    setupMockDom({ mesText: child });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#282828');
});

test('16. Unsupported colors everywhere -> background-unresolved', () => {
    const parent = {
        parentElement: null,
        style: { backgroundColor: 'color-mix(in srgb, red, blue)' },
    };
    const child = {
        parentElement: parent,
        style: { backgroundColor: 'linear-gradient(red, blue)' },
    };
    setupMockDom({ mesText: child });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'unavailable',
        reason: 'background-unresolved',
    });
});

test('17. getComputedStyle throwing on child still permits parent resolution', () => {
    const parent = {
        parentElement: null,
        style: { backgroundColor: 'rgb(30, 30, 30)' },
    };
    const child = {
        parentElement: parent,
        style: {},
    };
    setupMockDom({ mesText: child, throwOn: child });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#1E1E1E');
});

test('18. getComputedStyle throwing everywhere -> background-unresolved', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(10, 10, 10)' },
    };
    setupMockDom({ mesText, throwAlways: true });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'unavailable',
        reason: 'background-unresolved',
    });
});

test('19. Result always uses minimumContrast 4.5', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(0, 0, 0)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.minimumContrast, 4.5);
});

test('20. Returned background uses canonical #RRGGBB', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(18, 52, 86)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.ok(/^#[0-9A-F]{6}$/.test(result.options.backgroundColor));
});

test('21. Channel zero works', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(0, 0, 0)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.equal(result.options.backgroundColor, '#000000');
});

test('22. Channel 255 works', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(255, 255, 255)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.equal(result.options.backgroundColor, '#FFFFFF');
});

test('23. Whitespace in computed color is tolerated', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: '   rgb(   10  ,   20  ,   30   )   ' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.equal(result.options.backgroundColor, '#0A141E');
});

test('24. Out-of-range numeric channels are clamped safely if encountered', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(300, -50, 256)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.equal(result.options.backgroundColor, '#FF00FF');
});

test('25. Invalid alpha values are ignored safely', () => {
    const parent = {
        parentElement: null,
        style: { backgroundColor: 'rgb(20, 20, 20)' },
    };
    const child = {
        parentElement: parent,
        style: { backgroundColor: 'rgba(255, 255, 255, 2.5)' },
    };
    setupMockDom({ mesText: child });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#141414');
});

test('26. documentElement can provide final background', () => {
    const docElement = {
        parentElement: null,
        style: { backgroundColor: 'rgb(40, 40, 40)' },
    };
    const child = {
        parentElement: null,
        style: { backgroundColor: 'transparent' },
    };
    setupMockDom({ mesText: child, docElement });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#282828');
});

test('27. body background can provide final background where applicable', () => {
    const docElement = {
        parentElement: null,
        style: { backgroundColor: 'transparent' },
    };
    const body = {
        parentElement: docElement,
        style: { backgroundColor: 'rgb(60, 60, 60)' },
    };
    const child = {
        parentElement: null,
        style: { backgroundColor: 'transparent' },
    };
    setupMockDom({ mesText: child, docElement, body });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#3C3C3C');
});

test('28. No duplicate/infinite ancestor traversal', () => {
    const nodeA = { style: { backgroundColor: 'transparent' } };
    const nodeB = { style: { backgroundColor: 'transparent' } };
    nodeA.parentElement = nodeB;
    nodeB.parentElement = nodeA;

    setupMockDom({ mesText: nodeA });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'unavailable',
        reason: 'background-unresolved',
    });
});

test('29. Repeated calls observe changed theme colors', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(20, 20, 20)' },
    };
    setupMockDom({ mesText });

    const result1 = resolveRuntimeOptions();
    assert.equal(result1.options.backgroundColor, '#141414');

    mesText.style.backgroundColor = 'rgb(80, 80, 80)';
    const result2 = resolveRuntimeOptions();
    assert.equal(result2.options.backgroundColor, '#505050');
});

test('30. No DOM mutation occurs', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(20, 20, 20)' },
    };
    setupMockDom({ mesText });

    const before = JSON.stringify(mesText);
    resolveRuntimeOptions();
    const after = JSON.stringify(mesText);

    assert.equal(before, after);
});

test('31. Function is synchronous', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(20, 20, 20)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.ok(!(result instanceof Promise));
});

test('32. No SillyTavern dependency is required', () => {
    assert.equal(typeof globalThis.SillyTavern, 'undefined');

    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(0, 0, 0)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
});

test('33. No persistence APIs are used', () => {
    let touched = false;
    const fakeStorage = {
        getItem() {
            touched = true;
        },
        setItem() {
            touched = true;
        },
    };

    const origLocal = globalThis.localStorage;
    globalThis.localStorage = fakeStorage;

    try {
        const mesText = {
            parentElement: null,
            style: { backgroundColor: 'rgb(0, 0, 0)' },
        };
        setupMockDom({ mesText });

        resolveRuntimeOptions();
        assert.equal(touched, false);
    } finally {
        globalThis.localStorage = origLocal;
    }
});

test('34. Returned objects are fresh between calls', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(0, 0, 0)' },
    };
    setupMockDom({ mesText });

    const r1 = resolveRuntimeOptions();
    const r2 = resolveRuntimeOptions();

    assert.notEqual(r1, r2);
    assert.notEqual(r1.options, r2.options);
});

test('35. Resolver does not use a hard-coded fallback color', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'transparent' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'unavailable',
        reason: 'background-unresolved',
    });
});

test('36. Fully semi-transparent ancestor chain falls back to inherited SillyTavern blur tint', () => {
    const body = {
        parentElement: null,
        style: {
            backgroundColor: 'rgba(255, 255, 255, 0.35)',
            customProperties: {
                '--SmartThemeBlurTintColor': 'rgba(245, 245, 245, 0.65)',
                '--SmartThemeChatTintColor': 'rgba(250, 250, 250, 0.45)',
            },
        },
    };
    const chat = {
        parentElement: body,
        style: { backgroundColor: 'rgba(250, 250, 250, 0.45)' },
    };
    const mes = {
        parentElement: chat,
        style: { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
    };
    const mesText = {
        parentElement: mes,
        style: { backgroundColor: 'transparent' },
    };

    setupMockDom({ mesText, chat, body });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.minimumContrast, 4.5);
    assert.ok(/^#[0-9A-F]{6}$/.test(result.options.backgroundColor));
});

test('37. Transparent custom-theme #chat can resolve from SmartTheme tint variables', () => {
    const chat = {
        parentElement: null,
        style: {
            backgroundColor: 'transparent',
            customProperties: {
                '--SmartThemeBlurTintColor': 'rgba(19, 21, 44, 1)',
                '--SmartThemeChatTintColor': 'rgba(25, 27, 49, 1)',
            },
        },
    };
    const mesText = {
        parentElement: chat,
        style: { backgroundColor: 'transparent' },
    };

    setupMockDom({ mesText, chat });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'ready',
        options: {
            backgroundColor: '#13152C',
            minimumContrast: 4.5,
        },
    });
});

test('38. Transparent blur tint is skipped in favor of a visible chat tint', () => {
    const chat = {
        parentElement: null,
        style: {
            backgroundColor: 'transparent',
            customProperties: {
                '--SmartThemeBlurTintColor': 'rgba(0, 0, 0, 0)',
                '--SmartThemeChatTintColor': 'rgba(240, 240, 240, 0.5)',
            },
        },
    };
    const mesText = {
        parentElement: chat,
        style: { backgroundColor: 'transparent' },
    };

    setupMockDom({ mesText, chat });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'ready',
        options: {
            backgroundColor: '#F0F0F0',
            minimumContrast: 4.5,
        },
    });
});

test('39. CSS color(srgb ...) computed colors are supported', () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'color(srgb 0.1 0.2 0.3)' },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'ready',
        options: {
            backgroundColor: '#1A334D',
            minimumContrast: 4.5,
        },
    });
});

test('40. CSS color(srgb ...) alpha layers composite over an opaque ancestor', () => {
    const parent = {
        parentElement: null,
        style: { backgroundColor: '#000000' },
    };
    const child = {
        parentElement: parent,
        style: { backgroundColor: 'color(srgb 1 1 1 / 50%)' },
    };
    setupMockDom({ mesText: child });

    const result = resolveRuntimeOptions();
    assert.equal(result.status, 'ready');
    assert.equal(result.options.backgroundColor, '#808080');
});

test('41. Hex theme variables are accepted as representative background colors', () => {
    const mesText = {
        parentElement: null,
        style: {
            backgroundColor: 'transparent',
            customProperties: {
                '--SmartThemeBlurTintColor': '#FAFAFA',
            },
        },
    };
    setupMockDom({ mesText });

    const result = resolveRuntimeOptions();
    assert.deepEqual(result, {
        status: 'ready',
        options: {
            backgroundColor: '#FAFAFA',
            minimumContrast: 4.5,
        },
    });
});

test('42. Theme-variable fallback remains dynamic across theme changes', () => {
    const mesText = {
        parentElement: null,
        style: {
            backgroundColor: 'transparent',
            customProperties: {
                '--SmartThemeBlurTintColor': 'rgba(20, 20, 20, 0.7)',
            },
        },
    };
    setupMockDom({ mesText });

    const first = resolveRuntimeOptions();
    assert.equal(first.options.backgroundColor, '#141414');

    mesText.style.customProperties['--SmartThemeBlurTintColor'] = 'rgba(240, 240, 240, 0.7)';
    const second = resolveRuntimeOptions();
    assert.equal(second.options.backgroundColor, '#F0F0F0');
});
