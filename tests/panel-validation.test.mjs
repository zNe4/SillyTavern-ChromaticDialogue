import assert from 'node:assert/strict';
import test from 'node:test';

function createControl(value = '') {
    const listeners = new Map();

    return {
        value,

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

test('validates assignment input without writing metadata', async (t) => {
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
        hidden: true,
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

    let chatMetadata = {};
    let saveMetadataCalls = 0;

    globalThis.document = {
        getElementById(id) {
            return id === 'chromatic-dialogue-settings'
                ? panel
                : null;
        },

        createElement() {
            throw new Error(
                'Empty assignments should not create rows.',
            );
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'Example chat',
                chatMetadata,

                async saveMetadata() {
                    saveMetadataCalls += 1;
                },
            };
        },
    };

    const moduleUrl = new URL(
        `../src/panel.js?panel-validation-test=${Date.now()}`,
        import.meta.url,
    );

    const { refreshPanelState } = await import(moduleUrl);

    refreshPanelState();
    refreshPanelState();

    assert.equal(addButton.listenerCount('click'), 1);
    assert.equal(assignmentFormFieldset.disabled, false);

    await addButton.dispatch('click');

    assert.equal(
        feedback.textContent,
        'Assignment ID must be c1 through c99.',
    );
    assert.equal(feedback.dataset.feedbackKind, 'error');
    assert.equal(feedback.hidden, false);

    nameInput.value = 'Valid name';
    hexColorInput.value = '#123ABC';

    for (const invalidId of [
        'c0',
        'c01',
        'c100',
        'custom-cd-c1',
    ]) {
        idInput.value = invalidId;
        await addButton.dispatch('click');

        assert.equal(
            feedback.textContent,
            'Assignment ID must be c1 through c99.',
        );
        assert.deepEqual(chatMetadata, {});
    }

    idInput.value = 'c1';
    nameInput.value = '   ';
    await addButton.dispatch('click');

    assert.equal(
        feedback.textContent,
        'Name cannot be empty.',
    );

    nameInput.value = 'Alice';
    hexColorInput.value = '#123';
    await addButton.dispatch('click');

    assert.equal(
        feedback.textContent,
        'Color must be a six-digit hexadecimal value such as #56B4E9.',
    );

    hexColorInput.value = '#123abc';
    chatMetadata = {
        chromatic_dialogue: {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Existing',
                    color: '#FFFFFF',
                },
            },
        },
    };
    idInput.value = ' C1 ';

    await addButton.dispatch('click');

    assert.equal(
        feedback.textContent,
        'Assignment c1 already exists.',
    );

    assert.equal(saveMetadataCalls, 0);

    chatMetadata = {};
    refreshPanelState();

    assert.equal(feedback.textContent, '');
    assert.equal(feedback.dataset.feedbackKind, undefined);
    assert.equal(feedback.hidden, true);
});
