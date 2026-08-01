import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { GENERATED_STYLE_ID } from '../src/constants.js';
import { refreshDialogueStyles } from '../src/style-runtime.js';

function createElement(tagName) {
    const listeners = new Map();

    return {
        tagName: tagName.toUpperCase(),
        className: '',
        dataset: {},
        textContent: '',
        children: [],
        attributes: new Map(),
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

        getAttribute(name) {
            return this.attributes.get(name) ?? null;
        },

        setAttribute(name, value) {
            this.attributes.set(name, String(value));
        },

        append(...children) {
            this.children.push(...children);
        },
    };
}

function createPanel(drawerToggle = null) {
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
        [
            '#chromatic-dialogue-assignment-list',
            assignmentList,
        ],
        [
            '#chromatic-dialogue-assignment-fields',
            assignmentFormFieldset,
        ],
    ]);

    if (drawerToggle) {
        controls.set(
            '#chromatic-dialogue-drawer-toggle',
            drawerToggle,
        );
    }

    const panel = {
        dataset: {},

        querySelector(selector) {
            return controls.get(selector) ?? null;
        },
    };

    return {
        assignmentFormFieldset,
        assignmentList,
        emptyChatState,
        noChatState,
        panel,
    };
}

test('static panel markup exposes labeled, keyboard-reachable controls', () => {
    const settings = readFileSync(
        new URL('../settings.html', import.meta.url),
        'utf8',
    );
    const styles = readFileSync(
        new URL('../style.css', import.meta.url),
        'utf8',
    );
    const ids = [
        ...settings.matchAll(/\bid="([^"]+)"/g),
    ].map((match) => match[1]);
    const inputTags = [
        ...settings.matchAll(/<input\b[\s\S]*?>/g),
    ].map((match) => match[0]);
    const idInput = inputTags.find((tag) =>
        tag.includes('id="chromatic-dialogue-assignment-id"')
    );

    assert.equal(ids.length, new Set(ids).size);
    assert.ok(idInput);
    assert.doesNotMatch(idInput, /\bmaxlength=/);
    assert.match(
        idInput,
        /aria-describedby="chromatic-dialogue-assignment-id-help"/,
    );
    assert.match(
        settings,
        /<button[\s\S]*?id="chromatic-dialogue-drawer-toggle"[\s\S]*?type="button"[\s\S]*?aria-controls="chromatic-dialogue-drawer-content"[\s\S]*?aria-expanded="false"/,
    );
    assert.match(
        settings,
        /<label class="chromatic-dialogue-field">[\s\S]*?<span>Assignment ID<\/span>[\s\S]*?<input/,
    );
    assert.match(
        settings,
        /<label class="chromatic-dialogue-field">[\s\S]*?<span>Name<\/span>[\s\S]*?<input/,
    );
    assert.match(
        settings,
        /<label class="chromatic-dialogue-field">[\s\S]*?<span>Color picker<\/span>[\s\S]*?<input/,
    );
    assert.match(
        settings,
        /<label class="chromatic-dialogue-field">[\s\S]*?<span>Hex color<\/span>[\s\S]*?<input/,
    );
    assert.match(
        styles,
        /\.chromatic-dialogue-settings button:focus-visible,[\s\S]*?outline: 2px solid currentColor;/,
    );
    assert.match(
        styles,
        /\.chromatic-dialogue-assignment-name \{[\s\S]*?min-width: 0;[\s\S]*?overflow-wrap: anywhere;/,
    );
    assert.match(
        styles,
        /@container \(max-width: 420px\)[\s\S]*?\.chromatic-dialogue-form-actions \{[\s\S]*?flex-direction: column;/,
    );
});

test('drawer expansion state toggles once per activation', async (t) => {
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

    const drawerToggle = createElement('button');

    drawerToggle.setAttribute('aria-expanded', 'false');

    const { panel } = createPanel(drawerToggle);

    globalThis.document = {
        getElementById(id) {
            return id === 'chromatic-dialogue-settings'
                ? panel
                : null;
        },

        createElement,
    };
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata: {},
            };
        },
    };

    const moduleUrl = new URL(
        `../src/panel.js?phase6-drawer-test=${Date.now()}`,
        import.meta.url,
    );
    const { refreshPanelState } = await import(moduleUrl);

    refreshPanelState();
    refreshPanelState();

    assert.equal(drawerToggle.listenerCount('click'), 1);

    await drawerToggle.dispatch('click');
    assert.equal(drawerToggle.getAttribute('aria-expanded'), 'true');

    await drawerToggle.dispatch('click');
    assert.equal(drawerToggle.getAttribute('aria-expanded'), 'false');
});

test('reload reconstructs boundary rows, Unicode names, and generated CSS', async (t) => {
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

    const longUnicodeName =
        'Élodie 雪 👩🏽‍🚀 — ' + '非常に長い名前'.repeat(80);
    const context = {
        chatId: 'phase-6-boundaries',
        chatMetadata: {
            chromatic_dialogue: {
                schemaVersion: 1,
                assignments: {
                    c99: {
                        name: `  ${longUnicodeName}  `,
                        color: '#abcdef',
                    },
                    c10: {
                        name: 'Ten',
                        color: '#101010',
                    },
                    c1: {
                        name: 'One',
                        color: '#010101',
                    },
                    c9: {
                        name: 'Nine',
                        color: '#090909',
                    },
                },
            },
        },
    };
    let currentPanel = createPanel();
    let generatedStyle = null;

    globalThis.document = {
        head: {
            append(element) {
                generatedStyle = element;
            },
        },

        getElementById(id) {
            if (id === 'chromatic-dialogue-settings') {
                return currentPanel.panel;
            }

            if (id === GENERATED_STYLE_ID) {
                return generatedStyle;
            }

            return null;
        },

        createElement,
    };
    globalThis.SillyTavern = {
        getContext() {
            return context;
        },
    };

    const moduleUrl = new URL(
        `../src/panel.js?phase6-reload-test=${Date.now()}`,
        import.meta.url,
    );
    const { refreshPanelState } = await import(moduleUrl);

    const render = () => {
        refreshDialogueStyles();
        refreshPanelState();

        return {
            css: generatedStyle.textContent,
            names: currentPanel.assignmentList.children.map(
                (row) => row.children[1].textContent,
            ),
            rows: currentPanel.assignmentList.children.map(
                (row) => row.dataset.assignmentId,
            ),
        };
    };
    const beforeReload = render();

    assert.deepEqual(beforeReload.rows, ['c1', 'c9', 'c10', 'c99']);
    assert.deepEqual(beforeReload.names, [
        'One',
        'Nine',
        'Ten',
        longUnicodeName,
    ]);
    assert.match(
        beforeReload.css,
        /\.custom-cd-c1 q \{[\s\S]*\.custom-cd-c9 q \{[\s\S]*\.custom-cd-c10 q \{[\s\S]*\.custom-cd-c99 q \{/,
    );

    currentPanel = createPanel();
    generatedStyle = null;

    const afterReload = render();

    assert.deepEqual(afterReload, beforeReload);
});
