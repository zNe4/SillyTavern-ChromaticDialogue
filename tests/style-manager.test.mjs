import test from 'node:test';
import assert from 'node:assert/strict';

import {
    GENERATED_STYLE_ID,
} from '../src/constants.js';
import {
    applyDialogueStyles,
    buildDialogueCss,
    ensureGeneratedStyleElement,
} from '../src/style-manager.js';

function createStyleDocument() {
    const elementsById = new Map();
    const appended = [];

    const document = {
        head: {
            append(element) {
                appended.push(element);
                elementsById.set(element.id, element);
            },
        },

        getElementById(id) {
            return elementsById.get(id) ?? null;
        },

        createElement(tagName) {
            assert.equal(tagName, 'style');

            return {
                id: '',
                tagName: 'STYLE',
                textContent: '',
            };
        },
    };

    return {
        appended,
        document,
        elementsById,
    };
}

test('builds deterministic rules for the rendered Regex classes', () => {
    assert.equal(
        buildDialogueCss({
            c10: {
                name: 'Carol',
                color: '#123456',
            },
            c1: {
                name: 'Alice',
                color: '#56B4E9',
            },
        }),
        [
            '#chat .mes_text .custom-cd-c1 {',
            '    color: #56B4E9;',
            '}',
            '',
            '#chat .mes_text .custom-cd-c10 {',
            '    color: #123456;',
            '}',
        ].join('\n'),
    );
});

test('no-chat and empty mappings generate no CSS', () => {
    assert.equal(buildDialogueCss(null), '');
    assert.equal(buildDialogueCss({}), '');
});

test('rejects unvalidated IDs, names, and colors', () => {
    for (const assignments of [
        undefined,
        [],
        {
            C1: {
                name: 'Alice',
                color: '#56B4E9',
            },
        },
        {
            c1: {
                name: ' Alice ',
                color: '#56B4E9',
            },
        },
        {
            c1: {
                name: 'Alice',
                color: '#56b4e9',
            },
        },
        {
            c1: {
                name: 'Alice',
                color: '#ABC',
            },
        },
    ]) {
        assert.throws(
            () => buildDialogueCss(assignments),
            TypeError,
        );
    }
});

test('creates one generated style element and reuses it', () => {
    const { appended, document } = createStyleDocument();

    const first = ensureGeneratedStyleElement(document);
    const second = ensureGeneratedStyleElement(document);

    assert.strictEqual(second, first);
    assert.equal(first.id, GENERATED_STYLE_ID);
    assert.equal(first.tagName, 'STYLE');
    assert.equal(appended.length, 1);
});

test('replaces generated CSS through one textContent assignment', () => {
    const { document, elementsById } = createStyleDocument();
    let writeCount = 0;
    let css = 'old css';

    const style = {
        id: GENERATED_STYLE_ID,
        tagName: 'STYLE',
        get textContent() {
            return css;
        },
        set textContent(value) {
            writeCount += 1;
            css = value;
        },
    };

    elementsById.set(GENERATED_STYLE_ID, style);

    const result = applyDialogueStyles(
        {
            c1: {
                name: 'Alice',
                color: '#56B4E9',
            },
        },
        document,
    );

    assert.strictEqual(result, style);
    assert.equal(writeCount, 1);
    assert.equal(
        css,
        '#chat .mes_text .custom-cd-c1 {\n' +
            '    color: #56B4E9;\n' +
            '}',
    );
});

test('clears previous CSS for empty and no-chat states', () => {
    const { document } = createStyleDocument();

    const style = applyDialogueStyles(
        {
            c1: {
                name: 'Alice',
                color: '#56B4E9',
            },
        },
        document,
    );

    assert.notEqual(style.textContent, '');

    applyDialogueStyles({}, document);
    assert.equal(style.textContent, '');

    style.textContent = 'stale css';
    applyDialogueStyles(null, document);
    assert.equal(style.textContent, '');
});

test('does not query or traverse message DOM nodes', () => {
    const { document } = createStyleDocument();

    document.querySelector = () => {
        throw new Error('Message DOM traversal is forbidden.');
    };
    document.querySelectorAll = document.querySelector;

    assert.doesNotThrow(() => {
        applyDialogueStyles(
            {
                c99: {
                    name: 'Bob',
                    color: '#A1B2C3',
                },
            },
            document,
        );
    });
});
