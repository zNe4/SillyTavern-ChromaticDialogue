import assert from 'node:assert/strict';
import test from 'node:test';

import { CHAT_METADATA_KEY } from '../src/constants.js';

function createControl(value = '') {
    const listeners = new Map();

    return {
        value,
        disabled: false,

        addEventListener(type, handler) {
            const handlers = listeners.get(type) ?? [];

            handlers.push(handler);
            listeners.set(type, handlers);
        },

        async dispatch(type) {
            for (const handler of listeners.get(type) ?? []) {
                await handler({
                    currentTarget: this,
                });
            }
        },

        listenerCount(type) {
            return listeners.get(type)?.length ?? 0;
        },
    };
}

function createMockElement(tagName) {
    const listeners = new Map();

    return {
        tagName: tagName.toUpperCase(),
        className: '',
        dataset: {},
        textContent: '',
        children: [],
        attributes: new Map(),

        addEventListener(type, handler) {
            const handlers = listeners.get(type) ?? [];

            handlers.push(handler);
            listeners.set(type, handlers);
        },

        async dispatch(type) {
            for (const handler of listeners.get(type) ?? []) {
                await handler({
                    currentTarget: this,
                });
            }
        },

        listenerCount(type) {
            return listeners.get(type)?.length ?? 0;
        },

        setAttribute(name, value) {
            this.attributes.set(name, String(value));
        },

        append(...children) {
            this.children.push(...children);
        },
    };
}

test('loads a fresh assignment into the form without saving', async (t) => {
    const originalDocument = globalThis.document;
    const originalSillyTavern = globalThis.SillyTavern;

    t.after(() => {
        if (originalDocument === undefined) {
            delete globalThis.document;
        } else {
            globalThis.document = originalDocument;
        }

        if (originalSillyTavern === undefined) {
            delete globalThis.SillyTavern;
        } else {
            globalThis.SillyTavern = originalSillyTavern;
        }
    });

    const idInput = createControl('');
    const nameInput = createControl('');
    const colorPicker = createControl('#56b4e9');
    const hexColorInput = createControl('#56B4E9');
    const addButton = createControl();

    const colorPreview = {
        style: {
            color: '',
        },
    };

    const feedback = {
        hidden: true,
        textContent: '',
        dataset: {},
    };

    const noChatState = {
        hidden: false,
    };

    const emptyChatState = {
        hidden: false,
    };

    const assignmentList = {
        hidden: true,
        children: [],

        replaceChildren(...children) {
            this.children = children;
        },
    };

    const assignmentFormFieldset = {
        disabled: true,
    };

    const controls = new Map([
        ['#chromatic-dialogue-no-chat', noChatState],
        ['#chromatic-dialogue-empty-state', emptyChatState],
        ['#chromatic-dialogue-assignment-list', assignmentList],
        [
            '#chromatic-dialogue-assignment-fields',
            assignmentFormFieldset,
        ],
        ['#chromatic-dialogue-assignment-id', idInput],
        ['#chromatic-dialogue-assignment-name', nameInput],
        [
            '#chromatic-dialogue-assignment-color-picker',
            colorPicker,
        ],
        [
            '#chromatic-dialogue-assignment-color',
            hexColorInput,
        ],
        [
            '#chromatic-dialogue-assignment-color-preview',
            colorPreview,
        ],
        ['#chromatic-dialogue-assignment-add', addButton],
        [
            '#chromatic-dialogue-assignment-feedback',
            feedback,
        ],
    ]);

    const panel = {
        dataset: {},

        querySelector(selector) {
            return controls.get(selector) ?? null;
        },
    };

    let saveMetadataCalls = 0;

    const context = {
        chatId: 'Example chat',
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c2: {
                        name: 'Original',
                        color: '#111111',
                    },
                },
            },
        },

        async saveMetadata() {
            saveMetadataCalls += 1;
        },
    };

    globalThis.document = {
        getElementById(id) {
            return id === 'chromatic-dialogue-settings'
                ? panel
                : null;
        },

        createElement(tagName) {
            return createMockElement(tagName);
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return context;
        },
    };

    const moduleUrl = new URL(
        `../src/panel.js?panel-selection-test=${Date.now()}`,
        import.meta.url,
    );

    const { refreshPanelState } = await import(moduleUrl);

    refreshPanelState();

    assert.equal(assignmentList.children.length, 1);

    const [row] = assignmentList.children;
    const actions = row.children[3];
    const [editButton] = actions.children;

    assert.equal(editButton.textContent, 'Edit');
    assert.equal(editButton.listenerCount('click'), 1);

    context.chatMetadata[CHAT_METADATA_KEY].assignments.c2 = {
        name: '  Latest name  ',
        color: '#abcdef',
    };

    const metadataBefore = JSON.stringify(
        context.chatMetadata,
    );

    await editButton.dispatch('click');

    assert.equal(idInput.value, 'c2');
    assert.equal(nameInput.value, 'Latest name');
    assert.equal(hexColorInput.value, '#ABCDEF');
    assert.equal(colorPicker.value, '#ABCDEF');
    assert.equal(colorPreview.style.color, '#ABCDEF');

    assert.equal(feedback.hidden, false);
    assert.equal(feedback.dataset.feedbackKind, 'valid');
    assert.equal(
        feedback.textContent,
        'Assignment c2 loaded for editing. No changes have been saved.',
    );

    assert.equal(saveMetadataCalls, 0);
    assert.equal(
        JSON.stringify(context.chatMetadata),
        metadataBefore,
    );
});
