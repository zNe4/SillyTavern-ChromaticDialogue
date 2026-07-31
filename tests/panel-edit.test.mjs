import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CHAT_METADATA_KEY,
    GENERATED_STYLE_ID,
} from '../src/constants.js';

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

async function createEditHarness(t) {
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

    const getEditButtons = () =>
        assignmentList.children.flatMap(
            (row) => row.children[3]?.children ?? [],
        );

    const panel = {
        dataset: {},

        querySelector(selector) {
            return controls.get(selector) ?? null;
        },

        querySelectorAll(selector) {
            return selector ===
                '.chromatic-dialogue-assignment-edit'
                ? getEditButtons()
                : [];
        },
    };

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
                        name: 'Original',
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
                editButtons: getEditButtons().every(
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
        `../src/panel.js?panel-edit-test=${Date.now()}-${Math.random()}`,
        import.meta.url,
    );
    const { refreshPanelState } = await import(moduleUrl);

    refreshPanelState();

    return {
        assignmentFormFieldset,
        assignmentList,
        cancelButton,
        colorPicker,
        colorPreview,
        context,
        feedback,
        formLegend,
        getEditButtons,
        getGeneratedStyle: () => generatedStyle,
        getResolvePendingSave: () => resolvePendingSave,
        getSaveMetadataCalls: () => saveMetadataCalls,
        hexColorInput,
        idInput,
        nameInput,
        panel,
        refreshPanelState,
        saveControlSnapshots,
        setHoldNextSave(value) {
            holdNextSave = value;
        },
        setSaveError(error) {
            saveError = error;
        },
        submitButton,
    };
}

async function selectAssignment(harness, index = 1) {
    const row = harness.assignmentList.children[index];
    const [editButton] = row.children[3].children;

    await editButton.dispatch('click');
}

test('persists an immutable-ID edit and refreshes the panel and CSS', async (t) => {
    const harness = await createEditHarness(t);

    await selectAssignment(harness);

    assert.equal(harness.panel.dataset.assignmentMode, 'edit');
    assert.equal(harness.idInput.value, 'c2');
    assert.equal(harness.idInput.readOnly, true);
    assert.equal(
        harness.formLegend.textContent,
        'Edit assignment c2',
    );
    assert.equal(harness.submitButton.textContent, 'Save changes');
    assert.equal(harness.cancelButton.hidden, false);

    harness.nameInput.value = '  Edited name  ';
    harness.hexColorInput.value = '#a1b2c3';

    await harness.submitButton.dispatch('click');

    assert.equal(harness.getSaveMetadataCalls(), 1);
    assert.deepEqual(harness.saveControlSnapshots, [
        {
            fieldset: true,
            submit: true,
            cancel: true,
            editButtons: true,
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
                c2: {
                    name: 'Edited name',
                    color: '#A1B2C3',
                },
            },
        },
    );
    assert.deepEqual(harness.context.chatMetadata.unrelated, {
        preserved: true,
    });

    assert.deepEqual(
        harness.assignmentList.children.map(
            (row) => row.children[1].textContent,
        ),
        ['Unrelated', 'Edited name'],
    );

    const generatedStyle = harness.getGeneratedStyle();

    assert.ok(generatedStyle);
    assert.match(
        generatedStyle.textContent,
        /\.custom-cd-c2 \{\n    color: #A1B2C3;/,
    );

    assert.equal(harness.panel.dataset.assignmentMode, 'add');
    assert.equal(harness.idInput.value, '');
    assert.equal(harness.nameInput.value, '');
    assert.equal(harness.idInput.readOnly, false);
    assert.equal(harness.formLegend.textContent, 'Add assignment');
    assert.equal(
        harness.submitButton.textContent,
        'Add assignment',
    );
    assert.equal(harness.submitButton.disabled, false);
    assert.equal(harness.cancelButton.hidden, true);
    assert.equal(harness.assignmentFormFieldset.disabled, false);
    assert.equal(harness.feedback.dataset.feedbackKind, 'valid');
    assert.equal(
        harness.feedback.textContent,
        'Assignment c2 updated.',
    );
});

test('rejects edit identity changes and supports explicit cancellation', async (t) => {
    const harness = await createEditHarness(t);
    const metadataBefore = JSON.stringify(
        harness.context.chatMetadata,
    );

    await selectAssignment(harness);

    harness.idInput.value = 'c3';
    harness.nameInput.value = 'Redirected';
    harness.hexColorInput.value = '#333333';

    await harness.submitButton.dispatch('click');

    assert.equal(harness.getSaveMetadataCalls(), 0);
    assert.equal(
        harness.feedback.textContent,
        'Assignment IDs cannot be changed while editing.',
    );
    assert.equal(harness.panel.dataset.assignmentMode, 'edit');
    assert.equal(
        JSON.stringify(harness.context.chatMetadata),
        metadataBefore,
    );

    await harness.cancelButton.dispatch('click');

    assert.equal(harness.panel.dataset.assignmentMode, 'add');
    assert.equal(harness.idInput.value, '');
    assert.equal(harness.nameInput.value, '');
    assert.equal(harness.idInput.readOnly, false);
    assert.equal(harness.cancelButton.hidden, true);
    assert.equal(
        harness.feedback.textContent,
        'Editing cancelled. No changes were saved.',
    );
    assert.equal(
        JSON.stringify(harness.context.chatMetadata),
        metadataBefore,
    );
});

test('rejects missing and unsupported edit targets without persistence', async (t) => {
    const harness = await createEditHarness(t);

    await selectAssignment(harness);

    delete harness.context.chatMetadata[
        CHAT_METADATA_KEY
    ].assignments.c2;

    await harness.submitButton.dispatch('click');

    assert.equal(harness.getSaveMetadataCalls(), 0);
    assert.equal(harness.panel.dataset.assignmentMode, 'add');
    assert.equal(
        harness.feedback.textContent,
        'The selected assignment is no longer available.',
    );

    harness.context.chatMetadata[CHAT_METADATA_KEY] = {
        schemaVersion: 1,
        assignments: {
            c2: {
                name: 'Restored',
                color: '#222222',
            },
        },
    };

    harness.refreshPanelState();

    const restoredRow = harness.assignmentList.children.find(
        (row) => row.dataset.assignmentId === 'c2',
    );
    const [editButton] = restoredRow.children[3].children;

    await editButton.dispatch('click');

    harness.context.chatMetadata[CHAT_METADATA_KEY] = {
        schemaVersion: 2,
        assignments: {
            c2: {
                name: 'Unsupported',
                color: '#999999',
            },
        },
    };
    const unsupportedBefore = JSON.stringify(
        harness.context.chatMetadata,
    );

    await harness.submitButton.dispatch('click');

    assert.equal(harness.getSaveMetadataCalls(), 0);
    assert.equal(harness.panel.dataset.assignmentMode, 'add');
    assert.equal(
        harness.feedback.textContent,
        'Open a supported chat before saving assignment changes.',
    );
    assert.equal(
        JSON.stringify(harness.context.chatMetadata),
        unsupportedBefore,
    );
});

test('locks edit controls and clears stale mode after a pending chat switch', async (t) => {
    const harness = await createEditHarness(t);

    await selectAssignment(harness);

    harness.nameInput.value = 'Saved in chat A';
    harness.hexColorInput.value = '#ABCDEF';
    harness.setHoldNextSave(true);

    const chatAMetadata = harness.context.chatMetadata;
    const pendingEdit = harness.submitButton.dispatch('click');

    await Promise.resolve();

    assert.equal(
        typeof harness.getResolvePendingSave(),
        'function',
    );
    assert.equal(harness.assignmentFormFieldset.disabled, true);
    assert.equal(harness.submitButton.disabled, true);
    assert.equal(harness.cancelButton.disabled, true);
    assert.equal(
        harness.getEditButtons().every(
            (button) => button.disabled,
        ),
        true,
    );

    const chatBMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Chat B',
                    color: '#BBBBBB',
                },
            },
        },
    };

    harness.context.chatId = 'chat-b';
    harness.context.chatMetadata = chatBMetadata;
    harness.getResolvePendingSave()();

    await pendingEdit;

    assert.equal(harness.getSaveMetadataCalls(), 1);
    assert.equal(
        chatAMetadata[CHAT_METADATA_KEY].assignments.c2.name,
        'Saved in chat A',
    );
    assert.deepEqual(
        chatBMetadata[CHAT_METADATA_KEY].assignments,
        {
            c1: {
                name: 'Chat B',
                color: '#BBBBBB',
            },
        },
    );
    assert.equal(harness.getGeneratedStyle(), null);
    assert.equal(harness.panel.dataset.assignmentMode, 'add');
    assert.equal(harness.idInput.value, '');
    assert.equal(harness.nameInput.value, '');
    assert.equal(harness.submitButton.disabled, false);
    assert.equal(harness.cancelButton.hidden, true);
    assert.equal(
        harness.getEditButtons().every(
            (button) => !button.disabled,
        ),
        true,
    );
    assert.equal(
        harness.feedback.textContent,
        'The active chat changed before the assignment could be saved.',
    );
});

test('keeps edit mode retryable and restores metadata after save failure', async (t) => {
    const originalConsoleError = console.error;
    const consoleErrors = [];

    console.error = (...args) => {
        consoleErrors.push(args);
    };

    t.after(() => {
        console.error = originalConsoleError;
    });

    const harness = await createEditHarness(t);
    const metadataBefore = JSON.stringify(
        harness.context.chatMetadata,
    );

    await selectAssignment(harness);

    harness.nameInput.value = 'Retry me';
    harness.hexColorInput.value = '#444444';
    harness.setSaveError(new Error('Disk unavailable'));

    await harness.submitButton.dispatch('click');

    assert.equal(harness.getSaveMetadataCalls(), 1);
    assert.equal(
        JSON.stringify(harness.context.chatMetadata),
        metadataBefore,
    );
    assert.equal(harness.panel.dataset.assignmentMode, 'edit');
    assert.equal(harness.idInput.value, 'c2');
    assert.equal(harness.nameInput.value, 'Retry me');
    assert.equal(harness.hexColorInput.value, '#444444');
    assert.equal(harness.idInput.readOnly, true);
    assert.equal(harness.submitButton.disabled, false);
    assert.equal(harness.cancelButton.disabled, false);
    assert.equal(harness.assignmentFormFieldset.disabled, false);
    assert.equal(harness.cancelButton.hidden, false);
    assert.equal(harness.feedback.dataset.feedbackKind, 'error');
    assert.equal(
        harness.feedback.textContent,
        'The assignment operation failed. Check the browser console for details.',
    );
    assert.equal(consoleErrors.length, 1);
    assert.equal(
        consoleErrors[0][0],
        '[Chromatic Dialogue] Failed to edit assignment.',
    );
});
