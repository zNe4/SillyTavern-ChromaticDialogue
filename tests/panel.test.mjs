import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {
    PANEL_ID,
    PANEL_DRAWER_TOGGLE_ID,
    NO_CHAT_STATE_ID,
    EMPTY_CHAT_STATE_ID,
    ASSIGNMENT_LIST_ID,
    ASSIGNMENT_FORM_FIELDSET_ID,
    ASSIGNMENT_FORM_LEGEND_ID,
    ASSIGNMENT_COLOR_PICKER_ID,
    ASSIGNMENT_HEX_COLOR_INPUT_ID,
    ASSIGNMENT_COLOR_PREVIEW_ID,
    ASSIGNMENT_ID_INPUT_ID,
    ASSIGNMENT_NAME_INPUT_ID,
    ASSIGNMENT_ADD_BUTTON_ID,
    ASSIGNMENT_CANCEL_EDIT_BUTTON_ID,
    ASSIGNMENT_FEEDBACK_ID,
    REVIEW_SECTION_ID,
    REVIEW_COUNT_ID,
    REVIEW_LIST_ID,
    REVIEW_FEEDBACK_ID,
    GENERATED_STYLE_ID,
} from '../src/constants.js';
import {
    putPendingReview,
    getPendingReview,
    removePendingReview,
    clearPendingReviewsForChat,
    clearAllPendingReviews,
    getPendingReviewCount,
    subscribePendingReviewChanges,
} from '../src/pending-review-store.js';
import { refreshPanelState } from '../src/panel.js';

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this._id = '';
        this.className = '';
        this.children = [];
        this.parentElement = null;
        this.style = {};
        this.dataset = {};
        this.hidden = false;
        this.disabled = false;
        this.readOnly = false;
        this.value = '';
        this.type = tagName.toLowerCase() === 'button' ? 'button' : '';
        this._textContent = '';
        this.attributes = new Map();
        this.eventListeners = new Map();
    }

    get id() {
        return this._id;
    }

    set id(val) {
        const str = String(val);
        this._id = str;
        if (str && this.ownerDocument?.elementsById) {
            this.ownerDocument.elementsById.set(str, this);
        }
    }

    get textContent() {
        if (this.children.length === 0) {
            return this._textContent;
        }
        return this.children.map(c => c.textContent).join('');
    }

    set textContent(val) {
        this._textContent = String(val);
        this.children = [];
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'id') {
            this.id = String(value);
        }
        if (name === 'class') {
            this.className = String(value);
        }
        if (name.startsWith('data-')) {
            const camelKey = name
                .slice(5)
                .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
            this.dataset[camelKey] = String(value);
        }
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    removeAttribute(name) {
        this.attributes.delete(name);
        if (name === 'id') {
            if (this._id && this.ownerDocument?.elementsById) {
                this.ownerDocument.elementsById.delete(this._id);
            }
            this._id = '';
        }
        if (name === 'class') this.className = '';
        if (name.startsWith('data-')) {
            const camelKey = name
                .slice(5)
                .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
            delete this.dataset[camelKey];
        }
    }

    hasAttribute(name) {
        return this.attributes.has(name);
    }

    appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        return child;
    }

    append(...children) {
        for (const child of children) {
            this.appendChild(child);
        }
    }

    replaceChildren(...newChildren) {
        this.children = [...newChildren];
        this._textContent = '';
        for (const c of this.children) {
            c.parentElement = this;
        }
    }

    addEventListener(type, listener) {
        if (!this.eventListeners.has(type)) {
            this.eventListeners.set(type, []);
        }
        this.eventListeners.get(type).push(listener);
    }

    removeEventListener(type, listener) {
        if (!this.eventListeners.has(type)) return;
        const listeners = this.eventListeners.get(type);
        const idx = listeners.indexOf(listener);
        if (idx !== -1) {
            listeners.splice(idx, 1);
        }
    }

    click() {
        const listeners = this.eventListeners.get('click') || [];
        for (const listener of [...listeners]) {
            listener({
                type: 'click',
                target: this,
                currentTarget: this,
                preventDefault() {},
                stopPropagation() {},
            });
        }
    }

    querySelector(selector) {
        for (const child of this.children) {
            if (matches(child, selector)) {
                return child;
            }
            const found = child.querySelector(selector);
            if (found) return found;
        }
        return null;
    }

    querySelectorAll(selector) {
        const results = [];
        for (const child of this.children) {
            if (matches(child, selector)) {
                results.push(child);
            }
            results.push(...child.querySelectorAll(selector));
        }
        return results;
    }
}

function matches(el, selector) {
    if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return el.id === id || el.getAttribute('id') === id;
    }
    if (selector.startsWith('.')) {
        const className = selector.slice(1);
        return (el.className || '').split(/\s+/).includes(className);
    }
    if (selector.startsWith('[') && selector.endsWith(']')) {
        const inner = selector.slice(1, -1);
        if (inner.includes('=')) {
            const [attr, val] = inner.split('=');
            const cleanVal = val.replace(/^["']|["']$/g, '');
            return el.getAttribute(attr) === cleanVal || el.dataset?.[attr.replace(/^data-/, '')] === cleanVal;
        }
        return el.hasAttribute(inner) || Boolean(el.dataset?.[inner.replace(/^data-/, '')]);
    }
    return el.tagName.toLowerCase() === selector.toLowerCase();
}

function createTestEnvironment(initialChatState = {}) {
    const elementsById = new Map();
    let panel = null;
    let head = null;

    const doc = {
        elementsById,
        createElement(tagName) {
            const el = new FakeElement(tagName);
            el.ownerDocument = this;
            return el;
        },
        getElementById(id) {
            return (
                elementsById.get(id) ??
                (panel && panel.id === id ? panel : null) ??
                panel?.querySelector?.(`#${id}`) ??
                (head && head.id === id ? head : null) ??
                head?.querySelector?.(`#${id}`) ??
                null
            );
        },
    };

    head = doc.createElement('head');
    head.id = 'head';
    doc.head = head;

    panel = doc.createElement('div');
    panel.id = PANEL_ID;
    panel.dataset.chatState = 'none';

    const drawerToggle = doc.createElement('button');
    drawerToggle.id = PANEL_DRAWER_TOGGLE_ID;
    panel.appendChild(drawerToggle);

    const noChatState = doc.createElement('div');
    noChatState.id = NO_CHAT_STATE_ID;
    noChatState.hidden = false;
    panel.appendChild(noChatState);

    const modeSelect = doc.createElement('select');
    modeSelect.id = 'chromatic-dialogue-operation-mode';
    panel.appendChild(modeSelect);

    const modeFeedback = doc.createElement('p');
    modeFeedback.id = 'chromatic-dialogue-operation-mode-feedback';
    modeFeedback.hidden = true;
    panel.appendChild(modeFeedback);

    const reviewSection = doc.createElement('section');
    reviewSection.id = REVIEW_SECTION_ID;
    reviewSection.hidden = true;

    const reviewCount = doc.createElement('span');
    reviewCount.id = REVIEW_COUNT_ID;
    reviewCount.textContent = '0';
    reviewSection.appendChild(reviewCount);

    const reviewList = doc.createElement('div');
    reviewList.id = REVIEW_LIST_ID;
    reviewSection.appendChild(reviewList);

    const reviewFeedback = doc.createElement('p');
    reviewFeedback.id = REVIEW_FEEDBACK_ID;
    reviewFeedback.hidden = true;
    reviewSection.appendChild(reviewFeedback);
    panel.appendChild(reviewSection);

    const emptyChatState = doc.createElement('div');
    emptyChatState.id = EMPTY_CHAT_STATE_ID;
    emptyChatState.hidden = true;
    panel.appendChild(emptyChatState);

    const assignmentList = doc.createElement('div');
    assignmentList.id = ASSIGNMENT_LIST_ID;
    assignmentList.hidden = true;
    panel.appendChild(assignmentList);

    const form = doc.createElement('form');
    const fieldset = doc.createElement('fieldset');
    fieldset.id = ASSIGNMENT_FORM_FIELDSET_ID;
    fieldset.disabled = true;

    const legend = doc.createElement('legend');
    legend.id = ASSIGNMENT_FORM_LEGEND_ID;
    legend.textContent = 'Add assignment';
    fieldset.appendChild(legend);

    const idInput = doc.createElement('input');
    idInput.id = ASSIGNMENT_ID_INPUT_ID;
    fieldset.appendChild(idInput);

    const nameInput = doc.createElement('input');
    nameInput.id = ASSIGNMENT_NAME_INPUT_ID;
    fieldset.appendChild(nameInput);

    const colorPicker = doc.createElement('input');
    colorPicker.id = ASSIGNMENT_COLOR_PICKER_ID;
    colorPicker.type = 'color';
    colorPicker.value = '#56B4E9';
    fieldset.appendChild(colorPicker);

    const hexInput = doc.createElement('input');
    hexInput.id = ASSIGNMENT_HEX_COLOR_INPUT_ID;
    hexInput.value = '#56B4E9';
    fieldset.appendChild(hexInput);

    const colorPreview = doc.createElement('span');
    colorPreview.id = ASSIGNMENT_COLOR_PREVIEW_ID;
    fieldset.appendChild(colorPreview);

    const cancelEditBtn = doc.createElement('button');
    cancelEditBtn.id = ASSIGNMENT_CANCEL_EDIT_BUTTON_ID;
    cancelEditBtn.hidden = true;
    fieldset.appendChild(cancelEditBtn);

    const addBtn = doc.createElement('button');
    addBtn.id = ASSIGNMENT_ADD_BUTTON_ID;
    fieldset.appendChild(addBtn);

    form.appendChild(fieldset);

    const assignmentFeedback = doc.createElement('p');
    assignmentFeedback.id = ASSIGNMENT_FEEDBACK_ID;
    assignmentFeedback.hidden = true;
    form.appendChild(assignmentFeedback);
    panel.appendChild(form);

    let currentChatId = initialChatState.chatId !== undefined ? initialChatState.chatId : 'chat-1';
    let currentMetadata = initialChatState.chatMetadata !== undefined ? initialChatState.chatMetadata : {
        chromatic_dialogue: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    const sillyTavernMock = {
        getContext() {
            return {
                chatId: currentChatId,
                chatMetadata: currentMetadata,
                saveMetadata: async () => {},
                renderExtensionTemplateAsync: async () => '',
            };
        },
    };

    let originalDoc;
    let originalST;

    return {
        document: doc,
        panel,
        elementsById,
        setChat(chatId, metadata = { chromatic_dialogue: { schemaVersion: 1, assignments: {} } }) {
            currentChatId = chatId;
            currentMetadata = metadata;
        },
        activate() {
            originalDoc = globalThis.document;
            originalST = globalThis.SillyTavern;
            globalThis.document = doc;
            globalThis.SillyTavern = sillyTavernMock;
        },
        cleanup() {
            if (originalDoc === undefined) {
                delete globalThis.document;
            } else {
                globalThis.document = originalDoc;
            }
            if (originalST === undefined) {
                delete globalThis.SillyTavern;
            } else {
                globalThis.SillyTavern = originalST;
            }
        },
    };
}

function createValidReview(overrides = {}) {
    return {
        chatId: 'chat-1',
        messageId: 0,
        proposals: [
            {
                id: 'c1',
                name: 'Alice',
                proposedColor: '#56B4E9',
                color: '#56B4E9',
                colorAdjusted: false,
                contrastRatio: 4.5,
            },
        ],
        ...overrides,
    };
}

async function loadFreshPanelModule() {
    const moduleUrl = new URL(
        `../src/panel.js?v=${Date.now()}_${Math.random()}`,
        import.meta.url,
    );
    return await import(moduleUrl);
}

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

    refreshPanelState({
        subscribePendingReviewChanges: () => () => {},
    });

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

test('2. refreshPanelState with no panel returns safely', () => {
    const origDoc = globalThis.document;
    try {
        globalThis.document = {
            getElementById() {
                return null;
            },
        };
        assert.doesNotThrow(() => {
            refreshPanelState();
        });
    } finally {
        globalThis.document = origDoc;
    }
});

test('3. no panel means no pending-store subscription', () => {
    const origDoc = globalThis.document;
    try {
        globalThis.document = {
            getElementById() {
                return null;
            },
        };
        let subscribeCalled = false;
        refreshPanelState({
            subscribePendingReviewChanges: () => {
                subscribeCalled = true;
                return () => {};
            },
        });
        assert.strictEqual(subscribeCalled, false);
    } finally {
        globalThis.document = origDoc;
    }
});

test('4. first refresh with mounted panel registers one pending subscription', async (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());

    let subscribeCalls = 0;
    let unsub;
    const freshModule = await loadFreshPanelModule();

    freshModule.refreshPanelState({
        subscribePendingReviewChanges: (listener) => {
            subscribeCalls++;
            unsub = subscribePendingReviewChanges(listener);
            return unsub;
        },
    });
    t.after(() => {
        if (unsub) unsub();
    });

    assert.equal(subscribeCalls, 1);
});

test('5. repeated refreshPanelState does not create duplicate subscriptions', async (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());

    let subscribeCalls = 0;
    let unsub;
    const freshModule = await loadFreshPanelModule();
    const deps = {
        subscribePendingReviewChanges: (listener) => {
            subscribeCalls++;
            unsub = subscribePendingReviewChanges(listener);
            return unsub;
        },
    };
    t.after(() => {
        if (unsub) unsub();
    });

    freshModule.refreshPanelState(deps);
    freshModule.refreshPanelState(deps);
    freshModule.refreshPanelState(deps);

    assert.equal(subscribeCalls, 1);
});

test('6. review renderer called once per refresh', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());

    let renderCalls = 0;
    let passedChatId = null;

    refreshPanelState({
        renderReviewPanel: (panel, chatId) => {
            renderCalls++;
            passedChatId = chatId;
        },
    });

    assert.equal(renderCalls, 1);
    assert.equal(passedChatId, 'chat-1');
});

test('7. pending review already present before first refresh is rendered', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 4 }));
    t.after(() => clearAllPendingReviews());

    refreshPanelState();

    const section = env.panel.querySelector(`#${REVIEW_SECTION_ID}`);
    const countEl = env.panel.querySelector(`#${REVIEW_COUNT_ID}`);
    const listEl = env.panel.querySelector(`#${REVIEW_LIST_ID}`);

    assert.strictEqual(section.hidden, false);
    assert.equal(countEl.textContent, '1');
    assert.equal(listEl.children.length, 1);
    assert.equal(listEl.children[0].dataset.messageId, '4');
});

test('8. active chat with one pending review shows one card', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 0 }));
    t.after(() => clearAllPendingReviews());

    refreshPanelState();

    const countEl = env.panel.querySelector(`#${REVIEW_COUNT_ID}`);
    const listEl = env.panel.querySelector(`#${REVIEW_LIST_ID}`);
    assert.equal(countEl.textContent, '1');
    assert.equal(listEl.children.length, 1);
});

test('9. active chat with multiple pending reviews shows correct count/cards', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 2 }));
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 3 }));
    t.after(() => clearAllPendingReviews());

    refreshPanelState();

    const countEl = env.panel.querySelector(`#${REVIEW_COUNT_ID}`);
    const listEl = env.panel.querySelector(`#${REVIEW_LIST_ID}`);
    assert.equal(countEl.textContent, '3');
    assert.equal(listEl.children.length, 3);
    assert.deepEqual(
        listEl.children.map(c => c.dataset.messageId),
        ['1', '2', '3'],
    );
});

test('10. no active chat hides/clears Review UI', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    t.after(() => clearAllPendingReviews());

    refreshPanelState();
    const section = env.panel.querySelector(`#${REVIEW_SECTION_ID}`);
    assert.strictEqual(section.hidden, false);

    env.setChat(null);
    refreshPanelState();

    assert.strictEqual(section.hidden, true);
    assert.equal(env.panel.querySelector(`#${REVIEW_COUNT_ID}`).textContent, '0');
    assert.equal(env.panel.querySelector(`#${REVIEW_LIST_ID}`).children.length, 0);
});

test('11-15. chat switching displays correct scoped reviews and preserves store', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());

    putPendingReview(createValidReview({ chatId: 'chat-A', messageId: 10 }));
    putPendingReview(createValidReview({ chatId: 'chat-B', messageId: 20 }));
    t.after(() => clearAllPendingReviews());

    env.setChat('chat-A');
    refreshPanelState();
    const listEl = env.panel.querySelector(`#${REVIEW_LIST_ID}`);
    assert.equal(listEl.children.length, 1);
    assert.equal(listEl.children[0].dataset.messageId, '10');

    env.setChat('chat-B');
    refreshPanelState();
    assert.equal(listEl.children.length, 1);
    assert.equal(listEl.children[0].dataset.messageId, '20');

    env.setChat('chat-A');
    refreshPanelState();
    assert.equal(listEl.children.length, 1);
    assert.equal(listEl.children[0].dataset.messageId, '10');

    assert.equal(getPendingReviewCount('chat-A'), 1);
    assert.equal(getPendingReviewCount('chat-B'), 1);
    assert.equal(getPendingReviewCount(), 2);
});

test('16-17. putPendingReview triggers automatic panel refresh and card appears', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    env.setChat('chat-1');
    refreshPanelState();

    const section = env.panel.querySelector(`#${REVIEW_SECTION_ID}`);
    assert.strictEqual(section.hidden, true);

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 7 }));

    assert.strictEqual(section.hidden, false);
    assert.equal(env.panel.querySelector(`#${REVIEW_COUNT_ID}`).textContent, '1');
    const listEl = env.panel.querySelector(`#${REVIEW_LIST_ID}`);
    assert.equal(listEl.children.length, 1);
    assert.equal(listEl.children[0].dataset.messageId, '7');
});

test('18-19. removePendingReview triggers automatic refresh and card disappears', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    env.setChat('chat-1');
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 9 }));
    refreshPanelState();

    const listEl = env.panel.querySelector(`#${REVIEW_LIST_ID}`);
    assert.equal(listEl.children.length, 1);

    removePendingReview('chat-1', 9);

    assert.equal(listEl.children.length, 0);
    assert.strictEqual(env.panel.querySelector(`#${REVIEW_SECTION_ID}`).hidden, true);
    assert.equal(env.panel.querySelector(`#${REVIEW_COUNT_ID}`).textContent, '0');
});

test('20. clearPendingReviewsForChat triggers automatic refresh', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    env.setChat('chat-1');
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 2 }));
    refreshPanelState();

    assert.equal(env.panel.querySelector(`#${REVIEW_LIST_ID}`).children.length, 2);

    clearPendingReviewsForChat('chat-1');

    assert.equal(env.panel.querySelector(`#${REVIEW_LIST_ID}`).children.length, 0);
    assert.strictEqual(env.panel.querySelector(`#${REVIEW_SECTION_ID}`).hidden, true);
});

test('21. clearAllPendingReviews triggers automatic refresh', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    env.setChat('chat-1');
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    refreshPanelState();

    assert.equal(env.panel.querySelector(`#${REVIEW_LIST_ID}`).children.length, 1);

    clearAllPendingReviews();

    assert.equal(env.panel.querySelector(`#${REVIEW_LIST_ID}`).children.length, 0);
    assert.strictEqual(env.panel.querySelector(`#${REVIEW_SECTION_ID}`).hidden, true);
});

test('22. no-op/invalid store mutations do not trigger reactive refresh', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());

    let renderCalls = 0;
    refreshPanelState({
        renderReviewPanel: () => {
            renderCalls++;
        },
    });
    assert.equal(renderCalls, 1);

    putPendingReview(null);
    putPendingReview({});
    removePendingReview('invalid', 0);
    clearPendingReviewsForChat('invalid');
    clearAllPendingReviews();

    assert.equal(renderCalls, 1);
});

test('23-24. pending mutation for inactive chat does not leak into active chat UI', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    env.setChat('chat-active');
    refreshPanelState();

    assert.strictEqual(env.panel.querySelector(`#${REVIEW_SECTION_ID}`).hidden, true);

    putPendingReview(createValidReview({ chatId: 'chat-inactive', messageId: 99 }));

    assert.strictEqual(env.panel.querySelector(`#${REVIEW_SECTION_ID}`).hidden, true);
    assert.equal(env.panel.querySelector(`#${REVIEW_LIST_ID}`).children.length, 0);
});

test('25. store notification triggers refreshDialogueStyles', (t) => {
    const env = createTestEnvironment({
        chatId: 'chat-1',
        chatMetadata: {
            chromatic_dialogue: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#56B4E9' },
                },
            },
        },
    });
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    refreshPanelState();

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));

    const styleEl = env.document.getElementById(GENERATED_STYLE_ID);
    assert.notStrictEqual(styleEl, null);
    assert.ok(styleEl.textContent.includes('custom-cd-c1'));
    assert.ok(styleEl.textContent.includes('#56B4E9'));
});

test('26. store notification triggers refreshPanelState', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    refreshPanelState();
    const section = env.panel.querySelector(`#${REVIEW_SECTION_ID}`);
    assert.strictEqual(section.hidden, true);

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    assert.strictEqual(section.hidden, false);
});

test('27. one store mutation causes one reactive panel refresh, not duplicates', async (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    let callbackCalls = 0;
    let unsub;
    const freshModule = await loadFreshPanelModule();

    freshModule.refreshPanelState({
        subscribePendingReviewChanges: (listener) => {
            unsub = subscribePendingReviewChanges((event) => {
                callbackCalls++;
                listener(event);
            });
            return unsub;
        },
    });
    t.after(() => {
        if (unsub) unsub();
    });

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    assert.equal(callbackCalls, 1);
});

test('28. repeated manual panel refreshes still leave one subscription', async (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    let subscribeCalls = 0;
    let unsub;
    const freshModule = await loadFreshPanelModule();

    const deps = {
        subscribePendingReviewChanges: (listener) => {
            subscribeCalls++;
            unsub = subscribePendingReviewChanges(listener);
            return unsub;
        },
    };
    t.after(() => {
        if (unsub) unsub();
    });

    freshModule.refreshPanelState(deps);
    freshModule.refreshPanelState(deps);
    freshModule.refreshPanelState(deps);
    freshModule.refreshPanelState(deps);

    assert.equal(subscribeCalls, 1);
});

test('29. review rendering does not disrupt assignment list', (t) => {
    const env = createTestEnvironment({
        chatId: 'chat-1',
        chatMetadata: {
            chromatic_dialogue: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#56B4E9' },
                    c2: { name: 'Bob', color: '#B86FD4' },
                },
            },
        },
    });
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    refreshPanelState();

    const assignmentList = env.panel.querySelector(`#${ASSIGNMENT_LIST_ID}`);
    assert.strictEqual(assignmentList.hidden, false);
    assert.equal(assignmentList.children.length, 2);
    assert.equal(assignmentList.children[0].dataset.assignmentId, 'c1');
    assert.equal(assignmentList.children[1].dataset.assignmentId, 'c2');
});

test('30. review rendering does not disrupt assignment editor state', (t) => {
    const env = createTestEnvironment({
        chatId: 'chat-1',
        chatMetadata: {
            chromatic_dialogue: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#56B4E9' },
                },
            },
        },
    });
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    refreshPanelState();

    const editBtn = env.panel.querySelector('.chromatic-dialogue-assignment-edit');
    editBtn.click();
    assert.equal(env.panel.dataset.assignmentMode, 'edit');

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));

    assert.equal(env.panel.dataset.assignmentMode, 'edit');
    const legend = env.panel.querySelector(`#${ASSIGNMENT_FORM_LEGEND_ID}`);
    assert.equal(legend.textContent, 'Edit assignment c1');
});

test('31. Review UI and assignment UI may both be visible for the same active chat', (t) => {
    const env = createTestEnvironment({
        chatId: 'chat-1',
        chatMetadata: {
            chromatic_dialogue: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#56B4E9' },
                },
            },
        },
    });
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    refreshPanelState();

    const reviewSection = env.panel.querySelector(`#${REVIEW_SECTION_ID}`);
    const assignmentList = env.panel.querySelector(`#${ASSIGNMENT_LIST_ID}`);
    assert.strictEqual(reviewSection.hidden, false);
    assert.strictEqual(assignmentList.hidden, false);
});

test('32-34. reactive refresh updates assignment list and CSS when review persists assignment', (t) => {
    const env = createTestEnvironment({
        chatId: 'chat-1',
        chatMetadata: {
            chromatic_dialogue: {
                schemaVersion: 1,
                assignments: {},
            },
        },
    });
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    refreshPanelState();

    assert.equal(env.panel.querySelector(`#${REVIEW_LIST_ID}`).children.length, 1);
    assert.strictEqual(env.panel.querySelector(`#${ASSIGNMENT_LIST_ID}`).hidden, true);

    env.setChat('chat-1', {
        chromatic_dialogue: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: '#56B4E9' },
            },
        },
    });

    removePendingReview('chat-1', 1);

    assert.strictEqual(env.panel.querySelector(`#${REVIEW_SECTION_ID}`).hidden, true);
    const assignmentList = env.panel.querySelector(`#${ASSIGNMENT_LIST_ID}`);
    assert.strictEqual(assignmentList.hidden, false);

    assert.equal(assignmentList.children.length, 1);
    assert.equal(assignmentList.children[0].dataset.assignmentId, 'c1');

    const styleEl = env.document.getElementById(GENERATED_STYLE_ID);
    assert.notStrictEqual(styleEl, null);
    assert.ok(styleEl.textContent.includes('custom-cd-c1'));
    assert.ok(styleEl.textContent.includes('#56B4E9'));
});

test('35. dismissal removal does not alter assignment metadata', (t) => {
    const metadata = {
        chromatic_dialogue: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: '#56B4E9' },
            },
        },
    };
    const env = createTestEnvironment({
        chatId: 'chat-1',
        chatMetadata: metadata,
    });
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    refreshPanelState();

    removePendingReview('chat-1', 1);

    assert.deepEqual(metadata.chromatic_dialogue.assignments, {
        c1: { name: 'Alice', color: '#56B4E9' },
    });
});

test('36. no store notification recursion occurs', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    refreshPanelState();

    let eventCount = 0;
    const unsub = subscribePendingReviewChanges(() => {
        eventCount++;
    });
    t.after(() => unsub());

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));

    assert.equal(eventCount, 1);
});

test('37. subscription failure/null can be retried on later refresh', async (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    let unsub;
    const freshModule = await loadFreshPanelModule();

    freshModule.refreshPanelState({
        subscribePendingReviewChanges: () => null,
    });

    freshModule.refreshPanelState({
        subscribePendingReviewChanges: (listener) => {
            unsub = subscribePendingReviewChanges(listener);
            return unsub;
        },
    });
    t.after(() => {
        if (unsub) unsub();
    });

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    assert.strictEqual(env.panel.querySelector(`#${REVIEW_SECTION_ID}`).hidden, false);
});

test('38. no subscription is removed on chat switch', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    refreshPanelState();

    env.setChat('chat-2');
    refreshPanelState();

    env.setChat('chat-3');
    refreshPanelState();

    putPendingReview(createValidReview({ chatId: 'chat-3', messageId: 1 }));
    assert.strictEqual(env.panel.querySelector(`#${REVIEW_SECTION_ID}`).hidden, false);
});

test('39. panel module does not access pending-store internals', async () => {
    const panelModule = await import('../src/panel.js');
    assert.strictEqual(typeof panelModule.store, 'undefined');
    assert.strictEqual(typeof panelModule.listeners, 'undefined');
    assert.strictEqual(typeof panelModule.pendingReviewUnsubscribe, 'undefined');
});

test('40. panel module does not manually implement Review Approve/Dismiss logic', (t) => {
    const env = createTestEnvironment();
    env.activate();
    t.after(() => env.cleanup());
    t.after(() => clearAllPendingReviews());

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    refreshPanelState();

    const card = env.panel.querySelector('.chromatic-dialogue-review-card');
    assert.notStrictEqual(card, null);
    const buttons = card.querySelectorAll('button');
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].textContent, 'Dismiss');
    assert.equal(buttons[1].textContent, 'Approve');

    buttons[0].click();
    assert.strictEqual(getPendingReview('chat-1', 1), null);
});

test('operation mode controller: not called when no panel is mounted', () => {
    const origDoc = globalThis.document;
    try {
        globalThis.document = {
            getElementById() {
                return null;
            },
        };
        let modeCalls = 0;
        refreshPanelState({
            refreshOperationModeControl: () => {
                modeCalls++;
            },
        });
        assert.equal(modeCalls, 0);
    } finally {
        globalThis.document = origDoc;
    }
});

test('operation mode controller: mounted panel calls controller exactly once with the exact panel', () => {
    const env = createTestEnvironment();
    env.activate();
    try {
        let modeCalls = 0;
        let receivedPanel = null;
        refreshPanelState({
            refreshOperationModeControl: (p) => {
                modeCalls++;
                receivedPanel = p;
            },
        });
        assert.equal(modeCalls, 1);
        assert.strictEqual(receivedPanel, env.panel);
    } finally {
        env.cleanup();
    }
});

test('operation mode controller: repeated refreshPanelState calls call controller once per refresh', () => {
    const env = createTestEnvironment();
    env.activate();
    try {
        let modeCalls = 0;
        const fakeMode = () => {
            modeCalls++;
        };
        refreshPanelState({ refreshOperationModeControl: fakeMode });
        refreshPanelState({ refreshOperationModeControl: fakeMode });
        refreshPanelState({ refreshOperationModeControl: fakeMode });
        assert.equal(modeCalls, 3);
    } finally {
        env.cleanup();
    }
});

test('operation mode controller: called independently of active assignment state (no-chat, ready, malformed)', () => {
    const env = createTestEnvironment();
    env.activate();
    try {
        let calls = [];
        const fakeMode = (p) => {
            calls.push(p);
        };

        env.setChat(null);
        refreshPanelState({ refreshOperationModeControl: fakeMode });
        assert.equal(calls.length, 1);
        assert.strictEqual(calls[0], env.panel);

        env.setChat('chat-ready', {
            chromatic_dialogue: {
                schemaVersion: 1,
                assignments: { c1: { name: 'Alice', color: '#56B4E9' } },
            },
        });
        refreshPanelState({ refreshOperationModeControl: fakeMode });
        assert.equal(calls.length, 2);
        assert.strictEqual(calls[1], env.panel);

        env.setChat('chat-malformed', {
            chromatic_dialogue: { schemaVersion: 999 },
        });
        refreshPanelState({ refreshOperationModeControl: fakeMode });
        assert.equal(calls.length, 3);
        assert.strictEqual(calls[2], env.panel);
    } finally {
        env.cleanup();
    }
});

test('operation mode controller: runs without altering Review renderer call count (exactly once per refresh)', () => {
    const env = createTestEnvironment();
    env.activate();
    try {
        let modeCalls = 0;
        let reviewCalls = 0;
        refreshPanelState({
            refreshOperationModeControl: () => {
                modeCalls++;
            },
            renderReviewPanel: () => {
                reviewCalls++;
            },
        });
        assert.equal(modeCalls, 1);
        assert.equal(reviewCalls, 1);

        refreshPanelState({
            refreshOperationModeControl: () => {
                modeCalls++;
            },
            renderReviewPanel: () => {
                reviewCalls++;
            },
        });
        assert.equal(modeCalls, 2);
        assert.equal(reviewCalls, 2);
    } finally {
        env.cleanup();
    }
});

test('operation mode controller: integration does not add pending-review subscriptions', async () => {
    const env = createTestEnvironment();
    env.activate();
    let unsub;
    try {
        let subscribeCalls = 0;
        const freshModule = await loadFreshPanelModule();
        const deps = {
            subscribePendingReviewChanges: (listener) => {
                subscribeCalls++;
                unsub = subscribePendingReviewChanges(listener);
                return unsub;
            },
            refreshOperationModeControl: () => {},
        };
        freshModule.refreshPanelState(deps);
        freshModule.refreshPanelState(deps);
        freshModule.refreshPanelState(deps);
        assert.equal(subscribeCalls, 1);
    } finally {
        if (unsub) unsub();
        env.cleanup();
    }
});

test('operation mode controller: assignment list and editor behavior remain unchanged', () => {
    const env = createTestEnvironment({
        chatId: 'chat-1',
        chatMetadata: {
            chromatic_dialogue: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#56B4E9' },
                },
            },
        },
    });
    env.activate();
    try {
        let modeCalls = 0;
        refreshPanelState({
            refreshOperationModeControl: () => {
                modeCalls++;
            },
        });
        assert.equal(modeCalls, 1);

        const list = env.panel.querySelector(`#${ASSIGNMENT_LIST_ID}`);
        assert.strictEqual(list.hidden, false);
        assert.equal(list.children.length, 1);
        assert.equal(list.children[0].dataset.assignmentId, 'c1');

        const editBtn = env.panel.querySelector('.chromatic-dialogue-assignment-edit');
        editBtn.click();
        assert.equal(env.panel.dataset.assignmentMode, 'edit');
        const legend = env.panel.querySelector(`#${ASSIGNMENT_FORM_LEGEND_ID}`);
        assert.equal(legend.textContent, 'Edit assignment c1');
    } finally {
        env.cleanup();
    }
});

test('operation mode controller: dependency override is honored and production fallback is used when absent', () => {
    const env = createTestEnvironment({
        chatId: 'chat-fallback',
        chatMetadata: {
            chromatic_dialogue: {
                schemaVersion: 1,
                assignments: {},
            },
            chromatic_dialogue_mode: 'automatic',
        },
    });
    env.activate();
    try {
        let overrideCalled = false;
        let receivedPanel = null;
        refreshPanelState({
            refreshOperationModeControl: (p) => {
                overrideCalled = true;
                receivedPanel = p;
            },
        });
        assert.strictEqual(overrideCalled, true);
        assert.strictEqual(receivedPanel, env.panel);

        const select = env.panel.querySelector('#chromatic-dialogue-operation-mode');
        select.value = 'review';
        refreshPanelState();
        assert.equal(select.value, 'automatic');
    } finally {
        env.cleanup();
    }
});

test('panel source contract: imports controller, does not import mode store or query mode DOM or add runtime logic', () => {
    const panelSource = fs.readFileSync(
        new URL('../src/panel.js', import.meta.url),
        'utf8',
    );

    assert.match(
        panelSource,
        /import\s*\{[^}]*refreshOperationModeControl[^}]*\}\s*from\s*['"]\.\/mode-panel\.js['"]/,
    );

    assert.strictEqual(panelSource.includes('readActiveChatMode'), false);
    assert.strictEqual(panelSource.includes('saveActiveChatMode'), false);
    assert.strictEqual(panelSource.includes('mode-store.js'), false);
    assert.strictEqual(panelSource.includes('chromatic_dialogue_mode'), false);
    assert.strictEqual(
        panelSource.includes('chromatic-dialogue-operation-mode'),
        false,
    );
    assert.strictEqual(
        panelSource.includes('chromatic-dialogue-operation-mode-feedback'),
        false,
    );
    assert.strictEqual(panelSource.includes('MESSAGE_RECEIVED'), false);
    assert.strictEqual(panelSource.includes("'automatic'"), false);
    assert.strictEqual(panelSource.includes('"automatic"'), false);
    assert.strictEqual(panelSource.includes("'off'"), false);
    assert.strictEqual(panelSource.includes('"off"'), false);
});