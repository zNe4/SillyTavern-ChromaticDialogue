import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    CHAT_METADATA_KEY,
    GENERATED_STYLE_ID,
} from '../src/constants.js';
import { refreshDialogueStyles } from '../src/style-runtime.js';

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
    };
}

afterEach(() => {
    delete globalThis.SillyTavern;
});

test(
    'applies ready assignments and clears unsafe chat states',
    () => {
        const { appended, document } = createStyleDocument();

        let activeContext = {
            chatId: 'chat-a',
            chatMetadata: {
                [CHAT_METADATA_KEY]: {
                    schemaVersion: 1,
                    assignments: {
                        c1: {
                            name: '  Alice  ',
                            color: ' #56b4e9 ',
                        },
                    },
                },
            },
        };

        globalThis.SillyTavern = {
            getContext() {
                return activeContext;
            },
        };

        const style = refreshDialogueStyles(document);

        assert.equal(style.id, GENERATED_STYLE_ID);
        assert.equal(
            style.textContent,
            '#chat .mes_text .custom-cd-c1,\n' +
                '#chat .mes_text .custom-cd-c1 q {\n' +
                '    color: #56B4E9;\n' +
                '}',
        );
        assert.equal(appended.length, 1);

        activeContext = {
            chatId: null,
            chatMetadata: {},
        };

        const noChatStyle = refreshDialogueStyles(document);

        assert.strictEqual(noChatStyle, style);
        assert.equal(style.textContent, '');
        assert.equal(appended.length, 1);

        style.textContent = 'stale css';

        activeContext = {
            chatId: 'chat-b',
            chatMetadata: {
                [CHAT_METADATA_KEY]: {
                    schemaVersion: 2,
                    assignments: {
                        c1: {
                            name: 'Unknown',
                            color: '#123456',
                        },
                    },
                },
            },
        };

        const unsupportedStyle =
            refreshDialogueStyles(document);

        assert.strictEqual(unsupportedStyle, style);
        assert.equal(style.textContent, '');
        assert.equal(appended.length, 1);
    },
);
