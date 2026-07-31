import assert from 'node:assert/strict';
import test from 'node:test';

function createInput(value) {
    const listeners = new Map();

    return {
        value,

        addEventListener(type, handler) {
            const handlers = listeners.get(type) ?? [];

            handlers.push(handler);
            listeners.set(type, handlers);
        },

        dispatch(type) {
            for (const handler of listeners.get(type) ?? []) {
                handler({
                    currentTarget: this,
                });
            }
        },

        listenerCount(type) {
            return listeners.get(type)?.length ?? 0;
        },
    };
}

test('synchronizes picker and valid hex input without persistence', async (t) => {
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

    const colorPicker = createInput('#56b4e9');
    const hexColorInput = createInput('#56B4E9');

    const colorPreview = {
        style: {
            color: '',
        },
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

    const panel = {
        dataset: {},

        querySelector(selector) {
            if (selector === '#chromatic-dialogue-no-chat') {
                return noChatState;
            }

            if (selector === '#chromatic-dialogue-empty-state') {
                return emptyChatState;
            }

            if (
                selector ===
                '#chromatic-dialogue-assignment-list'
            ) {
                return assignmentList;
            }

            if (
                selector ===
                '#chromatic-dialogue-assignment-fields'
            ) {
                return assignmentFormFieldset;
            }

            if (
                selector ===
                '#chromatic-dialogue-assignment-color-picker'
            ) {
                return colorPicker;
            }

            if (
                selector ===
                '#chromatic-dialogue-assignment-color'
            ) {
                return hexColorInput;
            }

            if (
                selector ===
                '#chromatic-dialogue-assignment-color-preview'
            ) {
                return colorPreview;
            }

            return null;
        },
    };

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
                chatMetadata: {},
            };
        },
    };

    const moduleUrl = new URL(
        `../src/panel.js?panel-controls-test=${Date.now()}`,
        import.meta.url,
    );

    const { refreshPanelState } = await import(moduleUrl);

    refreshPanelState();
    refreshPanelState();

    assert.equal(colorPicker.listenerCount('input'), 1);
    assert.equal(hexColorInput.listenerCount('input'), 1);
    assert.equal(assignmentFormFieldset.disabled, false);

    assert.equal(colorPreview.style.color, '#56B4E9');

    colorPicker.value = '#abcdef';
    colorPicker.dispatch('input');

    assert.equal(hexColorInput.value, '#ABCDEF');
    assert.equal(colorPreview.style.color, '#ABCDEF');

    hexColorInput.value = '#123abc';
    hexColorInput.dispatch('input');

    assert.equal(hexColorInput.value, '#123ABC');
    assert.equal(colorPicker.value, '#123ABC');
    assert.equal(colorPreview.style.color, '#123ABC');

    hexColorInput.value = '#123';
    hexColorInput.dispatch('input');

    assert.equal(hexColorInput.value, '#123');
    assert.equal(colorPicker.value, '#123ABC');
    assert.equal(colorPreview.style.color, '#123ABC');
});
