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
        textContent: '',
        disabled: false,
        hidden: false,
        readOnly: false,

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
    const element = createControl();

    return {
        ...element,
        tagName: tagName.toUpperCase(),
        className: '',
        dataset: {},
        children: [],
        attributes: new Map(),

        setAttribute(name, value) {
            this.attributes.set(name, String(value));
        },

        append(...children) {
            this.children.push(...children);
        },
    };
}

async function createDeleteHarness(t) {
    const originalConfirm = globalThis.confirm;
    const originalDocument = globalThis.document;
    const originalSillyTavern = globalThis.SillyTavern;

    t.after(() => {
        if (originalConfirm === undefined) {
            delete globalThis.confirm;
        } else {
            globalThis.confirm = originalConfirm;
        }

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
    const colorPicker = createControl('#56B4E9');
    const hexColorInput = createControl('#56B4E9');
    const submitButton = createControl();
    const cancelButton = createControl();
    const formLegend = createControl();

    cancelButton.hidden = true;
    formLegend.textContent = 'Add assignment';
    submitButton.textContent = 'Add assignment';

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
        [
            '#chromatic-dialogue-assignment-legend',
            formLegend,
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
        ['#chromatic-dialogue-assignment-add', submitButton],
        [
            '#chromatic-dialogue-assignment-cancel-edit',
            cancelButton,
        ],
        [
            '#chromatic-dialogue-assignment-feedback',
            feedback,
        ],
    ]);

    const getButtons = (className) =>
        assignmentList.children.flatMap(
            (row) => row.children[3]?.children ?? [],
        ).filter(
            (button) =>
                button.className
                    .split(/\s+/)
                    .includes(className),
        );

    const getActionButtons = () => [
        ...getButtons('chromatic-dialogue-assignment-edit'),
        ...getButtons('chromatic-dialogue-assignment-delete'),
    ];

    const panel = {
        dataset: {},

        querySelector(selector) {
            return controls.get(selector) ?? null;
        },

        querySelectorAll(selector) {
            return selector.startsWith('.')
                ? getButtons(selector.slice(1))
                : [];
        },
    };

    let confirmImplementation = () => true;
    const confirmPrompts = [];
    let generatedStyle = null;
    let saveMetadataCalls = 0;
    let saveError = null;
    let holdNextSave = false;
    let resolvePendingSave = null;
    const saveControlSnapshots = [];

    const context = {
        chatId: 'chat-a',
        chatMetadata: {
            unrelated: {
                preserved: true,
            },
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: {
                        name: 'Unrelated',
                        color: '#111111',
                    },
                    c2: {
                        name: 'Delete me',
                        color: '#222222',
                    },
                },
            },
        },

        async saveMetadata() {
            saveMetadataCalls += 1;
            saveControlSnapshots.push({
                fieldset: assignmentFormFieldset.disabled,
                submit: submitButton.disabled,
                cancel: cancelButton.disabled,
                actionButtons: getActionButtons().every(
                    (button) => button.disabled,
                ),
            });

            if (holdNextSave) {
                await new Promise((resolve) => {
                    resolvePendingSave = resolve;
                });
            }

            if (saveError) {
                throw saveError;
            }
        },
    };

    globalThis.confirm = (message) => {
        confirmPrompts.push(message);

        return confirmImplementation(message);
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
        `../src/panel.js?panel-delete-test=${Date.now()}-${Math.random()}`,
        import.meta.url,
    );
    const { refreshPanelState } = await import(moduleUrl);

    refreshPanelState();

    return {
        assignmentFormFieldset,
        assignmentList,
        cancelButton,
        colorPicker,
        confirmPrompts,
        context,
        emptyChatState,
        feedback,
        formLegend,
        getActionButtons,
        getGeneratedStyle: () => generatedStyle,
        getResolvePendingSave: () => resolvePendingSave,
        getSaveMetadataCalls: () => saveMetadataCalls,
        hexColorInput,
        idInput,
        nameInput,
        panel,
        refreshPanelState,
        saveControlSnapshots,
        setConfirmImplementation(value) {
            confirmImplementation = value;
        },
        setHoldNextSave(value) {
            holdNextSave = value;
        },
        setSaveError(error) {
            saveError = error;
        },
        submitButton,
    };
}

function getRow(harness, id) {
    return harness.assignmentList.children.find(
        (row) => row.dataset.assignmentId === id,
    );
}

function getRowButton(harness, id, action) {
    const row = getRow(harness, id);
    const className =
        `chromatic-dialogue-assignment-${action}`;

    return row?.children[3].children.find(
        (button) =>
            button.className
                .split(/\s+/)
                .includes(className),
    );
}

test('confirms, persists, and immediately renders deletion', async (t) => {
    const harness = await createDeleteHarness(t);
    const deleteButton = getRowButton(
        harness,
        'c2',
        'delete',
    );

    assert.ok(deleteButton);
    assert.equal(deleteButton.textContent, 'Delete');
    assert.equal(
        deleteButton.attributes.get('aria-label'),
        'Delete assignment c2',
    );
    assert.equal(deleteButton.listenerCount('click'), 1);

    await deleteButton.dispatch('click');

    assert.deepEqual(harness.confirmPrompts, [
        'Delete assignment c2 (Delete me)? This cannot be undone.',
    ]);
    assert.equal(harness.getSaveMetadataCalls(), 1);
    assert.deepEqual(harness.saveControlSnapshots, [
        {
            fieldset: true,
            submit: true,
            cancel: true,
            actionButtons: true,
        },
    ]);
    assert.deepEqual(
        harness.context.chatMetadata[CHAT_METADATA_KEY],
        {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Unrelated',
                    color: '#111111',
                },
            },
        },
    );
    assert.deepEqual(harness.context.chatMetadata.unrelated, {
        preserved: true,
    });
    assert.deepEqual(
        harness.assignmentList.children.map(
            (row) => row.dataset.assignmentId,
        ),
        ['c1'],
    );

    const generatedStyle = harness.getGeneratedStyle();

    assert.ok(generatedStyle);
    assert.match(generatedStyle.textContent, /\.custom-cd-c1/);
    assert.doesNotMatch(
        generatedStyle.textContent,
        /\.custom-cd-c2/,
    );
    assert.equal(harness.feedback.dataset.feedbackKind, 'valid');
    assert.equal(
        harness.feedback.textContent,
        'Assignment c2 deleted.',
    );
    assert.equal(
        harness.getActionButtons().every(
            (button) => !button.disabled,
        ),
        true,
    );
});

test('a cancelled deletion writes nothing', async (t) => {
    const harness = await createDeleteHarness(t);
    const metadataBefore = JSON.stringify(
        harness.context.chatMetadata,
    );

    harness.setConfirmImplementation(() => false);

    await getRowButton(
        harness,
        'c2',
        'delete',
    ).dispatch('click');

    assert.equal(harness.confirmPrompts.length, 1);
    assert.equal(harness.getSaveMetadataCalls(), 0);
    assert.equal(
        JSON.stringify(harness.context.chatMetadata),
        metadataBefore,
    );
    assert.equal(
        harness.feedback.textContent,
        'Deletion cancelled. No changes were saved.',
    );
    assert.equal(harness.feedback.dataset.feedbackKind, 'valid');
});

test('missing and unsupported delete targets never confirm or persist', async (t) => {
    const harness = await createDeleteHarness(t);
    const missingDeleteButton = getRowButton(
        harness,
        'c2',
        'delete',
    );

    delete harness.context.chatMetadata[
        CHAT_METADATA_KEY
    ].assignments.c2;

    await missingDeleteButton.dispatch('click');

    assert.equal(harness.confirmPrompts.length, 0);
    assert.equal(harness.getSaveMetadataCalls(), 0);
    assert.equal(
        harness.feedback.textContent,
        'The selected assignment is no longer available.',
    );

    const unsupportedDeleteButton = getRowButton(
        harness,
        'c1',
        'delete',
    );

    harness.context.chatMetadata[CHAT_METADATA_KEY] = {
        schemaVersion: 2,
        assignments: {
            c1: {
                name: 'Unsupported',
                color: '#999999',
            },
        },
    };

    await unsupportedDeleteButton.dispatch('click');

    assert.equal(harness.confirmPrompts.length, 0);
    assert.equal(harness.getSaveMetadataCalls(), 0);
    assert.equal(
        harness.feedback.textContent,
        'Open a supported chat before deleting an assignment.',
    );
});

test('revalidates the assignment snapshot after confirmation', async (t) => {
    const harness = await createDeleteHarness(t);
    const metadata = harness.context.chatMetadata[
        CHAT_METADATA_KEY
    ];

    harness.setConfirmImplementation(() => {
        metadata.assignments.c2 = {
            name: 'Changed elsewhere',
            color: '#333333',
        };

        return true;
    });

    await getRowButton(
        harness,
        'c2',
        'delete',
    ).dispatch('click');

    assert.equal(harness.confirmPrompts.length, 1);
    assert.equal(harness.getSaveMetadataCalls(), 0);
    assert.deepEqual(metadata.assignments.c2, {
        name: 'Changed elsewhere',
        color: '#333333',
    });
    assert.equal(
        harness.feedback.textContent,
        'The selected assignment changed before deletion. Review it and try again.',
    );
});

test('deleting the active edit target clears the form and empty-state CSS', async (t) => {
    const harness = await createDeleteHarness(t);

    delete harness.context.chatMetadata[
        CHAT_METADATA_KEY
    ].assignments.c1;
    harness.refreshPanelState();

    await getRowButton(
        harness,
        'c2',
        'edit',
    ).dispatch('click');

    assert.equal(harness.panel.dataset.assignmentMode, 'edit');
    assert.equal(harness.idInput.value, 'c2');

    await getRowButton(
        harness,
        'c2',
        'delete',
    ).dispatch('click');

    assert.deepEqual(
        harness.context.chatMetadata[
            CHAT_METADATA_KEY
        ].assignments,
        {},
    );
    assert.equal(harness.panel.dataset.assignmentMode, 'add');
    assert.equal(harness.idInput.value, '');
    assert.equal(harness.nameInput.value, '');
    assert.equal(harness.idInput.readOnly, false);
    assert.equal(harness.cancelButton.hidden, true);
    assert.equal(harness.assignmentList.hidden, true);
    assert.deepEqual(harness.assignmentList.children, []);
    assert.equal(harness.emptyChatState.hidden, false);
    assert.equal(
        harness.getGeneratedStyle().textContent,
        '',
    );
    assert.equal(
        harness.feedback.textContent,
        'Assignment c2 deleted.',
    );
});

test('a pending chat switch never refreshes deletion into the new chat', async (t) => {
    const harness = await createDeleteHarness(t);

    harness.setHoldNextSave(true);

    const chatAMetadata = harness.context.chatMetadata;
    const pendingDelete = getRowButton(
        harness,
        'c2',
        'delete',
    ).dispatch('click');

    await Promise.resolve();

    assert.equal(
        typeof harness.getResolvePendingSave(),
        'function',
    );
    assert.equal(harness.assignmentFormFieldset.disabled, true);
    assert.equal(harness.submitButton.disabled, true);
    assert.equal(harness.cancelButton.disabled, true);
    assert.equal(
        harness.getActionButtons().every(
            (button) => button.disabled,
        ),
        true,
    );

    const chatBMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c2: {
                    name: 'Chat B',
                    color: '#BBBBBB',
                },
            },
        },
    };

    harness.context.chatId = 'chat-b';
    harness.context.chatMetadata = chatBMetadata;

    refreshDialogueStyles();
    harness.refreshPanelState();

    assert.equal(harness.feedback.hidden, true);
    assert.deepEqual(
        harness.assignmentList.children[0].children
            .slice(0, 3)
            .map((element) => element.textContent),
        ['c2', 'Chat B', '#BBBBBB'],
    );

    harness.getResolvePendingSave()();

    await pendingDelete;

    assert.equal(harness.getSaveMetadataCalls(), 1);
    assert.equal(
        Object.hasOwn(
            chatAMetadata[
                CHAT_METADATA_KEY
            ].assignments,
            'c2',
        ),
        false,
    );
    assert.deepEqual(
        chatBMetadata[CHAT_METADATA_KEY].assignments,
        {
            c2: {
                name: 'Chat B',
                color: '#BBBBBB',
            },
        },
    );
    assert.equal(
        harness.getGeneratedStyle().textContent,
        '#chat .mes_text .custom-cd-c2 {\n' +
            '    color: #BBBBBB;\n' +
            '}',
    );
    assert.equal(harness.feedback.hidden, true);
    assert.equal(harness.feedback.textContent, '');
    assert.equal(
        harness.getActionButtons().every(
            (button) => !button.disabled,
        ),
        true,
    );
});

test('failed persistence restores the assignment and permits retry', async (t) => {
    const originalConsoleError = console.error;
    const consoleErrors = [];

    console.error = (...args) => {
        consoleErrors.push(args);
    };

    t.after(() => {
        console.error = originalConsoleError;
    });

    const harness = await createDeleteHarness(t);
    const metadataBefore = JSON.stringify(
        harness.context.chatMetadata,
    );

    harness.setSaveError(new Error('Disk unavailable'));

    await getRowButton(
        harness,
        'c2',
        'delete',
    ).dispatch('click');

    assert.equal(harness.getSaveMetadataCalls(), 1);
    assert.equal(
        JSON.stringify(harness.context.chatMetadata),
        metadataBefore,
    );
    assert.ok(getRow(harness, 'c2'));
    assert.equal(harness.assignmentFormFieldset.disabled, false);
    assert.equal(harness.submitButton.disabled, false);
    assert.equal(
        harness.getActionButtons().every(
            (button) => !button.disabled,
        ),
        true,
    );
    assert.equal(harness.feedback.dataset.feedbackKind, 'error');
    assert.equal(
        harness.feedback.textContent,
        'The assignment deletion failed. Check the browser console for details.',
    );
    assert.equal(consoleErrors.length, 1);
    assert.equal(
        consoleErrors[0][0],
        '[Chromatic Dialogue] Failed to delete assignment.',
    );
});

test('a deleted assignment ID can be added again', async (t) => {
    const harness = await createDeleteHarness(t);

    await getRowButton(
        harness,
        'c2',
        'delete',
    ).dispatch('click');

    harness.idInput.value = 'c2';
    harness.nameInput.value = 'Replacement';
    harness.hexColorInput.value = '#abcdef';

    await harness.submitButton.dispatch('click');

    assert.equal(harness.getSaveMetadataCalls(), 2);
    assert.deepEqual(
        harness.context.chatMetadata[
            CHAT_METADATA_KEY
        ].assignments.c2,
        {
            name: 'Replacement',
            color: '#ABCDEF',
        },
    );
    assert.ok(getRow(harness, 'c2'));
    assert.match(
        harness.getGeneratedStyle().textContent,
        /\.custom-cd-c2 \{\n    color: #ABCDEF;/,
    );
    assert.equal(
        harness.feedback.textContent,
        'Assignment c2 added.',
    );
});
