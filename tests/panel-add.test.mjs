import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CHAT_METADATA_KEY,
    GENERATED_STYLE_ID,
} from '../src/constants.js';
import { refreshDialogueStyles } from '../src/style-runtime.js';

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
    return {
        tagName: tagName.toUpperCase(),
        className: '',
        dataset: {},
        textContent: '',
        children: [],
        attributes: new Map(),

        addEventListener() {},

        setAttribute(name, value) {
            this.attributes.set(name, String(value));
        },

        append(...children) {
            this.children.push(...children);
        },
    };
}

test('adds an assignment and refreshes the panel and CSS', async (t) => {
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

    let generatedStyle = null;
    let saveMetadataCalls = 0;
    let holdNextSave = false;
    let resolvePendingSave = null;

    const context = {
        chatId: 'Example chat',
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: {
                        name: 'Existing',
                        color: '#FFFFFF',
                    },
                },
            },
        },

        async saveMetadata() {
            saveMetadataCalls += 1;

            if (holdNextSave) {
                await new Promise((resolve) => {
                    resolvePendingSave = resolve;
                });
            }
        },
    };

    globalThis.document = {
        head: {
            append(element) {
                generatedStyle = element;
            },
        },

        getElementById(id) {
            if (id === 'chromatic-dialogue-settings') {
                return panel;
            }

            if (id === GENERATED_STYLE_ID) {
                return generatedStyle;
            }

            return null;
        },

        createElement(tagName) {
            if (tagName === 'style') {
                return {
                    id: '',
                    tagName: 'STYLE',
                    textContent: '',
                };
            }

            return createMockElement(tagName);
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return context;
        },
    };

    const moduleUrl = new URL(
        `../src/panel.js?panel-add-test=${Date.now()}`,
        import.meta.url,
    );

    const { refreshPanelState } = await import(moduleUrl);

    refreshPanelState();
    refreshPanelState();

    assert.equal(addButton.listenerCount('click'), 1);
    assert.equal(assignmentList.children.length, 1);

    idInput.value = ' C2 ';
    nameInput.value = ' Alice ';
    hexColorInput.value = '#123abc';

    await addButton.dispatch('click');

    assert.equal(saveMetadataCalls, 1);
    assert.equal(addButton.disabled, false);

    assert.deepEqual(
        context.chatMetadata[CHAT_METADATA_KEY],
        {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Existing',
                    color: '#FFFFFF',
                },
                c2: {
                    name: 'Alice',
                    color: '#123ABC',
                },
            },
        },
    );

    assert.ok(generatedStyle);
    assert.equal(generatedStyle.id, GENERATED_STYLE_ID);
    assert.equal(
        generatedStyle.textContent,
        '#chat .mes_text .custom-cd-c1 {\n' +
            '    color: #FFFFFF;\n' +
            '}\n\n' +
            '#chat .mes_text .custom-cd-c2 {\n' +
            '    color: #123ABC;\n' +
            '}',
    );

    assert.equal(panel.dataset.chatState, 'active');
    assert.equal(noChatState.hidden, true);
    assert.equal(emptyChatState.hidden, true);
    assert.equal(assignmentList.hidden, false);

    assert.deepEqual(
        assignmentList.children.map(
            (row) => row.dataset.assignmentId,
        ),
        ['c1', 'c2'],
    );

    assert.deepEqual(
        assignmentList.children[1].children
            .slice(0, 3)
            .map((element) => element.textContent),
        ['c2', 'Alice', '#123ABC'],
    );

    assert.equal(idInput.value, '');
    assert.equal(nameInput.value, '');

    assert.equal(feedback.hidden, false);
    assert.equal(feedback.dataset.feedbackKind, 'valid');
    assert.equal(
        feedback.textContent,
        'Assignment c2 added.',
    );

    idInput.value = 'c3';
    nameInput.value = 'Bob';
    hexColorInput.value = '#654321';
    holdNextSave = true;
    const chatAMetadata = context.chatMetadata;

    const pendingAdd = addButton.dispatch('click');

    await Promise.resolve();

    assert.equal(saveMetadataCalls, 2);
    assert.equal(addButton.disabled, true);
    assert.equal(typeof resolvePendingSave, 'function');

    context.chatId = 'Other chat';
    context.chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Daniel',
                    color: '#E69F00',
                },
            },
        },
    };

    refreshDialogueStyles();
    refreshPanelState();

    assert.equal(idInput.value, '');
    assert.equal(nameInput.value, '');
    assert.equal(colorPicker.value, '#56B4E9');
    assert.equal(hexColorInput.value, '#56B4E9');
    assert.equal(colorPreview.style.color, '#56B4E9');
    assert.equal(feedback.hidden, true);
    assert.deepEqual(
        assignmentList.children[0].children
            .slice(0, 3)
            .map((element) => element.textContent),
        ['c1', 'Daniel', '#E69F00'],
    );
    assert.equal(
        generatedStyle.textContent,
        '#chat .mes_text .custom-cd-c1 {\n' +
            '    color: #E69F00;\n' +
            '}',
    );

    resolvePendingSave();

    await pendingAdd;

    assert.equal(addButton.disabled, false);
    assert.deepEqual(
        chatAMetadata[CHAT_METADATA_KEY].assignments.c3,
        {
            name: 'Bob',
            color: '#654321',
        },
    );
    assert.deepEqual(
        context.chatMetadata[CHAT_METADATA_KEY].assignments,
        {
            c1: {
                name: 'Daniel',
                color: '#E69F00',
            },
        },
    );
    assert.equal(feedback.hidden, true);
    assert.equal(feedback.textContent, '');

    assert.deepEqual(
        assignmentList.children[0].children
            .slice(0, 3)
            .map((element) => element.textContent),
        ['c1', 'Daniel', '#E69F00'],
    );
    assert.equal(
        generatedStyle.textContent,
        '#chat .mes_text .custom-cd-c1 {\n' +
            '    color: #E69F00;\n' +
            '}',
    );
});
