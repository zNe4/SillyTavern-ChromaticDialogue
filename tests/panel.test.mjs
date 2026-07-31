import assert from 'node:assert/strict';
import test from 'node:test';

test('renders normalized assignments in numeric ID order', async (t) => {
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

            return null;
        },
    };

    globalThis.document = {
        getElementById(id) {
            return id === 'chromatic-dialogue-settings'
                ? panel
                : null;
        },

        createElement(tagName) {
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
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'Example chat',
                chatMetadata: {
                    chromatic_dialogue: {
                        schemaVersion: 1,
                        assignments: {
                            c10: {
                                name: 'Ten',
                                color: '#101010',
                            },
                            c2: {
                                name: 'Two',
                                color: '#202020',
                            },
                            c1: {
                                name: 'One',
                                color: '#303030',
                            },
                        },
                    },
                },
            };
        },
    };

    const moduleUrl = new URL(
        `../src/panel.js?panel-test=${Date.now()}`,
        import.meta.url,
    );

    const { refreshPanelState } = await import(moduleUrl);

    refreshPanelState();

    assert.equal(panel.dataset.chatState, 'active');
    assert.equal(noChatState.hidden, true);
    assert.equal(emptyChatState.hidden, true);
    assert.equal(assignmentList.hidden, false);
    assert.equal(assignmentFormFieldset.disabled, false);

    assert.deepEqual(
        assignmentList.children.map(
            (row) => row.dataset.assignmentId,
        ),
        ['c1', 'c2', 'c10'],
    );

    assert.deepEqual(
        assignmentList.children.map(
            (row) => row.children[1].textContent,
        ),
        ['One', 'Two', 'Ten'],
    );
});
