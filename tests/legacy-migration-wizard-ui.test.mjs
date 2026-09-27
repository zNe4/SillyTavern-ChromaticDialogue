import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { installLegacyMigrationWizardUI } from '../src/legacy-migration-wizard-ui.js';
import { createLegacyMigrationWizardController } from '../src/legacy-migration-wizard-controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Lightweight Fake DOM Implementation
// ============================================================================

class FakeClassList {
    constructor(el) {
        this.el = el;
        this.classes = new Set();
    }
    add(...names) {
        for (const name of names) {
            if (name) this.classes.add(name);
        }
        this._sync();
    }
    remove(...names) {
        for (const name of names) this.classes.delete(name);
        this._sync();
    }
    contains(name) {
        return this.classes.has(name);
    }
    _sync() {
        this.el._className = Array.from(this.classes).join(' ');
    }
}

class FakeEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.target = null;
        this.key = init.key || '';
        this.code = init.code || '';
        this.defaultPrevented = false;
    }
    preventDefault() {
        this.defaultPrevented = true;
    }
}

class FakeElement {
    constructor(tagName, ownerDocument) {
        this.tagName = tagName.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.children = [];
        this.parentNode = null;
        this.attributes = new Map();
        this.style = {};
        this.classList = new FakeClassList(this);
        this._className = '';
        this._textContent = '';
        this._value = '';
        this._checked = false;
        this._disabled = false;
        this._hidden = false;
        this.tabIndex = 0;
        this.type = '';
        this.placeholder = '';
        this.eventListeners = new Map();
    }

    get className() {
        return this._className;
    }
    set className(val) {
        this._className = val || '';
        this.classList.classes.clear();
        for (const c of this._className.split(/\s+/).filter(Boolean)) {
            this.classList.classes.add(c);
        }
    }

    get id() {
        return this.getAttribute('id') || '';
    }
    set id(val) {
        if (val) this.setAttribute('id', val);
        else this.removeAttribute('id');
    }

    get textContent() {
        if (this.children.length === 0) {
            return this._textContent;
        }
        return this.children.map((c) => c.textContent).join('');
    }
    set textContent(val) {
        this.children = [];
        this._textContent = val === null || val === undefined ? '' : String(val);
    }

    get value() {
        return this._value;
    }
    set value(val) {
        this._value = val === null || val === undefined ? '' : String(val);
    }

    get checked() {
        return this._checked;
    }
    set checked(val) {
        this._checked = Boolean(val);
    }

    get disabled() {
        return this._disabled;
    }
    set disabled(val) {
        this._disabled = Boolean(val);
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    get hidden() {
        return this._hidden;
    }
    set hidden(val) {
        this._hidden = Boolean(val);
        if (val) this.setAttribute('hidden', '');
        else this.removeAttribute('hidden');
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'id') this._id = String(value);
        if (name === 'class') this.className = String(value);
        if (name === 'disabled') this._disabled = true;
        if (name === 'hidden') this._hidden = true;
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    hasAttribute(name) {
        return this.attributes.has(name);
    }

    removeAttribute(name) {
        this.attributes.delete(name);
        if (name === 'disabled') this._disabled = false;
        if (name === 'hidden') this._hidden = false;
    }

    appendChild(child) {
        if (!child) return null;
        if (child.parentNode) {
            child.parentNode.removeChild(child);
        }
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    replaceChildren(...nodes) {
        for (const child of this.children) {
            child.parentNode = null;
        }
        this.children = [];
        this._textContent = '';
        for (const node of nodes) {
            if (node) this.appendChild(node);
        }
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            child.parentNode = null;
            this.children.splice(index, 1);
            return child;
        }
        return null;
    }

    addEventListener(type, listener) {
        if (!this.eventListeners.has(type)) {
            this.eventListeners.set(type, []);
        }
        this.eventListeners.get(type).push(listener);
    }

    removeEventListener(type, listener) {
        const listeners = this.eventListeners.get(type);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
        }
    }

    dispatchEvent(event) {
        if (!event.target) event.target = this;
        const listeners = this.eventListeners.get(event.type) || [];
        for (const listener of [...listeners]) {
            listener(event);
        }
        return !event.defaultPrevented;
    }

    click() {
        const event = new FakeEvent('click');
        event.target = this;
        this.dispatchEvent(event);
    }

    querySelector(selector) {
        const results = this.querySelectorAll(selector);
        return results[0] || null;
    }

    querySelectorAll(selector) {
        const results = [];
        const match = createMatcher(selector);
        const search = (node) => {
            for (const child of node.children) {
                if (match(child)) results.push(child);
                search(child);
            }
        };
        search(this);
        return results;
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeElement('body', this);
    }
    createElement(tagName) {
        return new FakeElement(tagName, this);
    }
    getElementById(id) {
        const search = (node) => {
            if (node.id === id) return node;
            for (const child of node.children) {
                const found = search(child);
                if (found) return found;
            }
            return null;
        };
        return search(this.body);
    }
    querySelector(selector) {
        return this.body.querySelector(selector);
    }
    querySelectorAll(selector) {
        return this.body.querySelectorAll(selector);
    }
}

function createMatcher(selector) {
    if (selector.startsWith('#')) {
        const targetId = selector.slice(1);
        return (el) => el.id === targetId;
    }
    if (selector.startsWith('.')) {
        const targetClass = selector.slice(1);
        return (el) => el.classList.contains(targetClass);
    }
    if (selector.startsWith('[') && selector.endsWith(']')) {
        const inner = selector.slice(1, -1);
        const [k, v] = inner.split('=');
        const val = v ? v.replace(/['"]/g, '') : null;
        return (el) => (val === null ? el.hasAttribute(k) : el.getAttribute(k) === val);
    }
    if (selector.includes('.')) {
        const [tag, className] = selector.split('.');
        return (el) => el.tagName.toLowerCase() === tag.toLowerCase() && el.classList.contains(className);
    }
    return (el) => el.tagName.toLowerCase() === selector.toLowerCase();
}

// ============================================================================
// Fake Popup & Context
// ============================================================================

const POPUP_TYPE = { TEXT: 1, CONFIRM: 2, INPUT: 3, DISPLAY: 4 };
const POPUP_RESULT = { CANCELLED: 0, AFFIRMATIVE: 1, NEGATIVE: 2 };

class FakePopup {
    static instances = [];
    static confirmResponse = POPUP_RESULT.AFFIRMATIVE;
    static confirmCalls = [];

    static show = {
        confirm: async (title, text, options = {}) => {
            FakePopup.confirmCalls.push({ title, text, options });
            return FakePopup.confirmResponse;
        },
    };

    constructor(content, type, inputValue, options) {
        this.content = content;
        this.type = type;
        this.inputValue = inputValue;
        this.options = options || {};
        this.shown = false;
        this.completed = false;
        FakePopup.instances.push(this);
    }

    show() {
        this.shown = true;
        return Promise.resolve();
    }

    complete(result) {
        this.completed = true;
        if (typeof this.options?.onClose === 'function') {
            this.options.onClose(result);
        }
    }

    attemptClose() {
        if (typeof this.options?.onClosing === 'function') {
            const allowed = this.options.onClosing();
            if (allowed === false) return false;
        }
        this.complete();
        return true;
    }
}

function createTestHarness(initialControllerState = {}, customControllerMethods = {}) {
    const doc = new FakeDocument();
    const extensionsMenu = doc.createElement('div');
    extensionsMenu.id = 'extensionsMenu';
    doc.body.appendChild(extensionsMenu);

    FakePopup.instances = [];
    FakePopup.confirmCalls = [];
    FakePopup.confirmResponse = POPUP_RESULT.AFFIRMATIVE;

    const controllerCalls = {
        scan: 0,
        setIncludeIntroduction: [],
        setMapping: [],
        clearMapping: [],
        preview: 0,
        apply: 0,
        undo: 0,
    };

    let state = {
        phase: 'idle',
        chatId: 'chat-1',
        includeIntroduction: false,
        inventory: null,
        mappings: [],
        preview: null,
        lastResult: null,
        undoAvailable: false,
        requiredMappingCount: 0,
        completedMappingCount: 0,
        canPreview: false,
        canApply: false,
        ...initialControllerState,
    };

    const mockController = {
        getState: () => ({ ...state, mappings: [...state.mappings] }),
        scan: () => {
            controllerCalls.scan++;
            if (customControllerMethods.scan) {
                return customControllerMethods.scan();
            }
            state.phase = 'mapping';
            return { status: 'ready', inventory: state.inventory };
        },
        setIncludeIntroduction: (val) => {
            controllerCalls.setIncludeIntroduction.push(val);
            if (customControllerMethods.setIncludeIntroduction) {
                return customControllerMethods.setIncludeIntroduction(val);
            }
            state.includeIntroduction = Boolean(val);
            return mockController.scan();
        },
        setMapping: (sourceKey, draft) => {
            controllerCalls.setMapping.push({ sourceKey, draft: { ...draft } });
            if (customControllerMethods.setMapping) {
                return customControllerMethods.setMapping(sourceKey, draft);
            }
            state.mappings = state.mappings.filter((m) => m.sourceKey !== sourceKey);
            state.mappings.push({ sourceKey, ...draft });
            state.completedMappingCount = state.mappings.length;
            state.canPreview = state.completedMappingCount >= state.requiredMappingCount;
            return { status: 'updated', mapping: { sourceKey, ...draft } };
        },
        clearMapping: (sourceKey) => {
            controllerCalls.clearMapping.push(sourceKey);
            if (customControllerMethods.clearMapping) {
                return customControllerMethods.clearMapping(sourceKey);
            }
            state.mappings = state.mappings.filter((m) => m.sourceKey !== sourceKey);
            state.completedMappingCount = state.mappings.length;
            state.canPreview = state.completedMappingCount >= state.requiredMappingCount;
            return { status: 'cleared', sourceKey };
        },
        preview: async () => {
            controllerCalls.preview++;
            if (customControllerMethods.preview) {
                return customControllerMethods.preview();
            }
            state.phase = 'preview';
            state.canApply = Boolean(state.preview && state.preview.status === 'ready');
            return state.preview;
        },
        apply: async () => {
            controllerCalls.apply++;
            if (customControllerMethods.apply) {
                return customControllerMethods.apply();
            }
            state.phase = 'applied';
            state.canApply = false;
            return state.lastResult || { status: 'applied' };
        },
        undo: async () => {
            controllerCalls.undo++;
            if (customControllerMethods.undo) {
                return customControllerMethods.undo();
            }
            state.phase = 'undone';
            return state.lastResult || { status: 'undone' };
        },
        reset: () => state,
        _setState: (updates) => {
            state = { ...state, ...updates };
        },
    };

    const getContext = () => ({
        Popup: FakePopup,
        POPUP_TYPE,
        POPUP_RESULT,
    });

    return {
        doc,
        extensionsMenu,
        mockController,
        controllerCalls,
        getContext,
        install: (deps = {}) =>
            installLegacyMigrationWizardUI({
                document: doc,
                getContext,
                createController: () => mockController,
                ...deps,
            }),
    };
}

// ============================================================================
// Top-Level Test Suite (Exact 40 Tests)
// ============================================================================

test('1. missing document/extensionsMenu -> unavailable without throw', () => {
    assert.deepEqual(installLegacyMigrationWizardUI({ document: null }), { status: 'unavailable' });
    const emptyDoc = new FakeDocument();
    assert.deepEqual(installLegacyMigrationWizardUI({ document: emptyDoc }), { status: 'unavailable' });
});

test('2. installer creates exact migration container and action IDs', () => {
    const { doc, install } = createTestHarness();
    const result = install();
    assert.equal(result.status, 'installed');
    assert.ok(doc.getElementById('chromatic-dialogue-migration-wand-container'));
    assert.ok(doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue'));
});

test('3. action uses expected host menu classes/icon/text/accessibility attributes', () => {
    const { doc, install } = createTestHarness();
    install();
    const action = doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue');
    assert.ok(action.classList.contains('list-group-item'));
    assert.ok(action.classList.contains('flex-container'));
    assert.ok(action.classList.contains('flexGap5'));
    assert.equal(action.getAttribute('role'), 'button');
    assert.equal(action.tabIndex, 0);

    const icon = action.querySelector('i');
    assert.ok(icon);
    assert.ok(icon.classList.contains('fa-solid'));
    assert.ok(icon.classList.contains('fa-palette'));
    assert.ok(icon.classList.contains('extensionsMenuExtensionButton'));
    assert.match(action.textContent, /Migrate Legacy Dialogue/);
});

test('4. repeated installer call is idempotent and creates no duplicate listener/item', () => {
    const { doc, install } = createTestHarness();
    assert.deepEqual(install(), { status: 'installed' });
    assert.deepEqual(install(), { status: 'already-installed' });
    const container = doc.getElementById('chromatic-dialogue-migration-wand-container');
    assert.equal(container.children.length, 1);
});

test('5. existing empty migration container is reused', () => {
    const { doc, extensionsMenu, install } = createTestHarness();
    const existingContainer = doc.createElement('div');
    existingContainer.id = 'chromatic-dialogue-migration-wand-container';
    existingContainer.className = 'extension_container';
    extensionsMenu.appendChild(existingContainer);

    const result = install();
    assert.equal(result.status, 'installed');
    assert.equal(doc.querySelectorAll('#chromatic-dialogue-migration-wand-container').length, 1);
    assert.equal(existingContainer.children.length, 1);
});

test('6. click activates wizard', () => {
    const { doc, install, controllerCalls } = createTestHarness();
    install();
    const action = doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue');
    action.click();
    assert.equal(FakePopup.instances.length, 1);
    assert.equal(controllerCalls.scan, 1);
});

test('7. Enter activates wizard', () => {
    const { doc, install, controllerCalls } = createTestHarness();
    install();
    const action = doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue');
    action.dispatchEvent(new FakeEvent('keydown', { key: 'Enter' }));
    assert.equal(FakePopup.instances.length, 1);
    assert.equal(controllerCalls.scan, 1);
});

test('8. Space activates and prevents default scrolling', () => {
    const { doc, install, controllerCalls } = createTestHarness();
    install();
    const action = doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue');
    const spaceEvent = new FakeEvent('keydown', { key: ' ' });
    action.dispatchEvent(spaceEvent);
    assert.equal(spaceEvent.defaultPrevented, true);
    assert.equal(FakePopup.instances.length, 1);
    assert.equal(controllerCalls.scan, 1);
});

test('9. repeated activation while popup is open creates only one popup', () => {
    const { doc, install } = createTestHarness();
    install();
    const action = doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue');
    action.click();
    action.click();
    action.dispatchEvent(new FakeEvent('keydown', { key: 'Enter' }));
    assert.equal(FakePopup.instances.length, 1);
});

test('10. after popup closes a fresh activation creates a new controller/popup', () => {
    let controllersCreated = 0;
    const { doc, getContext } = createTestHarness();
    installLegacyMigrationWizardUI({
        document: doc,
        getContext,
        createController: () => {
            controllersCreated++;
            return createLegacyMigrationWizardController();
        },
    });

    const action = doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue');
    action.click();
    assert.equal(FakePopup.instances.length, 1);
    assert.equal(controllersCreated, 1);

    FakePopup.instances[0].complete();

    action.click();
    assert.equal(FakePopup.instances.length, 2);
    assert.equal(controllersCreated, 2);
});

test('11. UI obtains Popup/POPUP_TYPE/POPUP_RESULT from fresh public getContext', () => {
    let getContextCalls = 0;
    const { doc, getContext, mockController } = createTestHarness();
    installLegacyMigrationWizardUI({
        document: doc,
        getContext: () => {
            getContextCalls++;
            return getContext();
        },
        createController: () => mockController,
    });

    const action = doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue');
    action.click();
    assert.equal(getContextCalls, 1);
});

test('12. missing Popup API fails safely without controller mutation', () => {
    const { doc } = createTestHarness();
    let controllerCreated = false;
    installLegacyMigrationWizardUI({
        document: doc,
        getContext: () => ({}),
        createController: () => {
            controllerCreated = true;
            return {};
        },
    });

    const action = doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue');
    action.click();
    assert.equal(controllerCreated, false);
});

test('13. main popup uses POPUP_TYPE.DISPLAY and wide+large+vertical-scrolling+left-align options', () => {
    const { doc, install } = createTestHarness();
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const popup = FakePopup.instances[0];
    assert.equal(popup.type, POPUP_TYPE.DISPLAY);
    assert.equal(popup.options.wide, true);
    assert.equal(popup.options.large, true);
    assert.equal(popup.options.allowVerticalScrolling, true);
    assert.equal(popup.options.leftAlign, true);
    assert.equal(popup.options.animation, 'fast');
});

test('14. main popup receives a real/injected Element rather than interpolated chat HTML', () => {
    const { doc, install } = createTestHarness();
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const popup = FakePopup.instances[0];
    assert.ok(popup.content instanceof FakeElement);
    assert.equal(popup.content.className, 'chromatic-dialogue-migration-wizard');
});

test('15. onClosing rejects closing while UI busy and allows it afterward', async () => {
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: 'c-1', adapters: ['html-font-color'], migratableCount: 1 }],
        stats: {},
    };
    const { doc, install, mockController } = createTestHarness({
        inventory,
        canApply: true,
        preview: {
            status: 'ready',
            stats: { changedMessageCount: 1, migratedOccurrenceCount: 1 },
            messageChanges: [{ messageIndex: 1, before: 'a', after: 'b' }],
        },
    });

    let resolveApply;
    mockController.apply = () =>
        new Promise((res) => {
            resolveApply = res;
        });

    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const popup = FakePopup.instances[0];
    assert.equal(popup.options.onClosing(), true);

    const applyBtn = popup.content.querySelector('.chromatic-dialogue-migration-apply-button');
    applyBtn.click();

    await new Promise((r) => setTimeout(r, 0));

    assert.equal(popup.options.onClosing(), false);
    assert.equal(popup.attemptClose(), false);
    assert.equal(popup.content.getAttribute('aria-busy'), 'true');

    resolveApply({ status: 'applied' });
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(popup.options.onClosing(), true);
    assert.equal(popup.attemptClose(), true);
});

test('16. popup opening triggers exactly one controller.scan and renders inventory summary', () => {
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: 'gold', sourceValue: 'gold', adapters: ['ff-named-color'], migratableCount: 2, occurrenceCount: 2, unknownColoredCount: 0, messageIndexes: [1] }],
        stats: {
            messageCount: 5,
            scannedMessageCount: 5,
            skippedMessageCount: 0,
            occurrenceCount: 2,
            migratableCount: 2,
            unknownColoredCount: 0,
            issueCount: 0,
            sourceGroupCount: 1,
        },
        skippedMessages: [{ messageIndex: 0, reason: 'intro-message' }],
    };
    const { doc, install, controllerCalls } = createTestHarness({ inventory });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    assert.equal(controllerCalls.scan, 1);
    const popup = FakePopup.instances[0];
    assert.match(popup.content.textContent, /Messages scanned/);
    assert.match(popup.content.textContent, /5/);
    assert.match(popup.content.textContent, /Legacy source groups/);
    assert.match(popup.content.textContent, /Migratable dialogue spans/);
    assert.match(popup.content.textContent, /Scanner issues/);
    assert.match(popup.content.textContent, /introductory greeting was intentionally excluded/i);

    const feedback = popup.content.querySelector('.chromatic-dialogue-migration-feedback');
    assert.equal(feedback.getAttribute('aria-live'), 'polite');
});

test('17. default introduction checkbox reflects false', () => {
    const inventory = { status: 'ready', groups: [], stats: {} };
    const { doc, install } = createTestHarness({ inventory, includeIntroduction: false });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const introCheckbox = FakePopup.instances[0].content.querySelector('#cd-migration-intro-toggle');
    assert.ok(introCheckbox);
    assert.equal(introCheckbox.checked, false);
});

test('18. toggling introduction without mapping work delegates directly to setIncludeIntroduction', () => {
    const inventory = { status: 'ready', groups: [], stats: {} };
    const { doc, install, controllerCalls } = createTestHarness({ inventory, completedMappingCount: 0, preview: null });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const introCheckbox = FakePopup.instances[0].content.querySelector('#cd-migration-intro-toggle');
    introCheckbox.checked = true;
    introCheckbox.dispatchEvent(new FakeEvent('change'));

    assert.equal(FakePopup.confirmCalls.length, 0);
    assert.deepEqual(controllerCalls.setIncludeIntroduction, [true]);
});

test('19. changing introduction with mapping/preview requires affirmative confirmation; cancel leaves state unchanged', async () => {
    const inventory = { status: 'ready', groups: [{ sourceKey: 'gold', adapters: ['html-font-color'], migratableCount: 1 }], stats: {} };
    const { doc, install, controllerCalls } = createTestHarness({
        inventory,
        completedMappingCount: 1,
        mappings: [{ sourceKey: 'gold', action: 'skip' }],
    });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const introCheckbox = FakePopup.instances[0].content.querySelector('#cd-migration-intro-toggle');

    FakePopup.confirmResponse = POPUP_RESULT.CANCELLED;
    introCheckbox.checked = true;
    introCheckbox.dispatchEvent(new FakeEvent('change'));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(FakePopup.confirmCalls.length, 1);
    assert.equal(controllerCalls.setIncludeIntroduction.length, 0);
    assert.equal(introCheckbox.checked, false);

    FakePopup.confirmResponse = POPUP_RESULT.AFFIRMATIVE;
    introCheckbox.checked = true;
    introCheckbox.dispatchEvent(new FakeEvent('change'));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(FakePopup.confirmCalls.length, 2);
    assert.deepEqual(controllerCalls.setIncludeIntroduction, [true]);
});

test('20. Rescan delegates to controller.scan; existing mapping work requires confirmation before clearing', async () => {
    const inventory = { status: 'ready', groups: [{ sourceKey: 'gold', adapters: ['html-font-color'], migratableCount: 1 }], stats: {} };
    const { doc, install, controllerCalls } = createTestHarness({
        inventory,
        completedMappingCount: 1,
        mappings: [{ sourceKey: 'gold', action: 'skip' }],
    });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();
    assert.equal(controllerCalls.scan, 1);

    const rescanBtn = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-rescan-button');
    assert.ok(rescanBtn);

    FakePopup.confirmResponse = POPUP_RESULT.CANCELLED;
    rescanBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(controllerCalls.scan, 1);

    FakePopup.confirmResponse = POPUP_RESULT.AFFIRMATIVE;
    rescanBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(controllerCalls.scan, 2);
});

test('21. one card is rendered for every inventory group in inventory order', () => {
    const inventory = {
        status: 'ready',
        groups: [
            {
                sourceKey: 'named:gold',
                sourceValue: 'gold',
                adapters: ['ff-named-color'],
                suggestedFinalColor: '#FFD700',
                migratableCount: 1,
                occurrenceCount: 1,
                unknownColoredCount: 0,
                messageIndexes: [1],
                samples: [{ messageIndex: 1, role: 'assistant', tone: 'whisper', classification: 'dialogue', content: 'hello' }],
            },
            {
                sourceKey: '#56B4E9',
                sourceValue: '#56B4E9',
                adapters: ['html-font-color', 'inline-css-color'],
                suggestedFinalColor: '#56B4E9',
                migratableCount: 2,
                occurrenceCount: 2,
                unknownColoredCount: 0,
                messageIndexes: [2],
                samples: [],
            },
        ],
        stats: {},
    };
    const { doc, install } = createTestHarness({ inventory });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const cards = FakePopup.instances[0].content.querySelectorAll('.chromatic-dialogue-migration-source-card');
    assert.equal(cards.length, 2);
    assert.equal(cards[0].getAttribute('data-source-key'), 'named:gold');
    assert.match(cards[0].textContent, /Freaky Frankenstein named color/);
    assert.match(cards[0].textContent, /whisper/);
    assert.equal(cards[1].getAttribute('data-source-key'), '#56B4E9');
    assert.match(cards[1].textContent, /HTML font color · Inline CSS color/);
});

test('22. non-migratable-only group has no action control and is clearly marked', () => {
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: 'gray', sourceValue: 'gray', adapters: ['html-font-color'], migratableCount: 0, occurrenceCount: 3, unknownColoredCount: 3, messageIndexes: [1] }],
        stats: {},
    };
    const { doc, install } = createTestHarness({ inventory });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const card = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-source-card');
    assert.match(card.textContent, /Detected but not automatically migratable/);
    assert.equal(card.querySelector('select'), null);
});

test('23. samples/source names containing HTML are rendered literally and never create injected elements', () => {
    const malicious = '<img src=x onerror="throw new Error(\'xss\')">';
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: malicious, sourceValue: malicious, adapters: ['html-font-color'], migratableCount: 1, occurrenceCount: 1, unknownColoredCount: 0, messageIndexes: [1], samples: [{ messageIndex: 1, role: 'assistant', tone: null, classification: 'dialogue', content: malicious }] }],
        stats: {},
    };
    const { doc, install } = createTestHarness({ inventory });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const popup = FakePopup.instances[0];
    assert.equal(popup.content.querySelectorAll('img').length, 0);
    const pre = popup.content.querySelector('pre');
    assert.equal(pre.textContent, malicious);
});

test('24. B3.2 suggestions are displayed but do NOT call setMapping automatically', () => {
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: 'named:gold', sourceValue: 'gold', adapters: ['ff-named-color'], suggestedFinalColor: '#FFD700', suggestedAssignmentId: 'c1', migratableCount: 1, occurrenceCount: 1, unknownColoredCount: 0, messageIndexes: [1], samples: [] }],
        existingAssignments: [{ id: 'c1', name: 'Mara', color: '#FFD700' }],
        stats: {},
    };
    const { doc, install, controllerCalls, mockController } = createTestHarness({ inventory });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    assert.equal(controllerCalls.setMapping.length, 0);
    assert.equal(mockController.getState().mappings.length, 0);
    const card = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-source-card');
    assert.match(card.textContent, /#FFD700/);
});

test('25. explicit Skip produces exact {action:\'skip\'} draft', () => {
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: 'gold', sourceValue: 'gold', adapters: ['html-font-color'], migratableCount: 1, occurrenceCount: 1, unknownColoredCount: 0, messageIndexes: [1] }],
        stats: {},
    };
    const { doc, install, controllerCalls } = createTestHarness({ inventory });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const select = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-action-select');
    select.value = 'skip';
    select.dispatchEvent(new FakeEvent('change'));

    assert.deepEqual(controllerCalls.setMapping, [{ sourceKey: 'gold', draft: { action: 'skip' } }]);
    assert.match(FakePopup.instances[0].content.textContent, /These recognized dialogue spans will remain unchanged/);
});

test('26. explicit Reuse initially produces blank assignmentId draft and assignment selector', () => {
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: 'gold', sourceValue: 'gold', adapters: ['html-font-color'], migratableCount: 1, occurrenceCount: 1, unknownColoredCount: 0, messageIndexes: [1] }],
        existingAssignments: [{ id: 'c3', name: 'Mara', color: '#FFD700' }],
        stats: {},
    };
    const { doc, install, controllerCalls } = createTestHarness({ inventory });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const select = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-action-select');
    select.value = 'reuse';
    select.dispatchEvent(new FakeEvent('change'));

    assert.deepEqual(controllerCalls.setMapping, [{ sourceKey: 'gold', draft: { action: 'reuse', assignmentId: '' } }]);
    const reuseSelect = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-reuse-select');
    assert.ok(reuseSelect);
    assert.match(reuseSelect.textContent, /c3 — Mara — #FFD700/);
});

test('27. Use Suggested Match requires explicit click and then sets exact suggestedAssignmentId', () => {
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: 'gold', sourceValue: 'gold', adapters: ['html-font-color'], suggestedAssignmentId: 'c3', migratableCount: 1, occurrenceCount: 1, unknownColoredCount: 0, messageIndexes: [1] }],
        existingAssignments: [{ id: 'c3', name: 'Mara', color: '#FFD700' }],
        stats: {},
    };
    const { doc, install, controllerCalls } = createTestHarness({
        inventory,
        mappings: [{ sourceKey: 'gold', action: 'reuse', assignmentId: '' }],
    });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const suggestBtn = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-suggestion-button');
    assert.ok(suggestBtn);
    assert.match(suggestBtn.textContent, /Use Suggested Match/);

    suggestBtn.click();
    assert.deepEqual(controllerCalls.setMapping.at(-1), {
        sourceKey: 'gold',
        draft: { action: 'reuse', assignmentId: 'c3' },
    });
});

test('28. explicit Create initially produces blank name/color draft', () => {
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: 'gold', sourceValue: 'gold', adapters: ['html-font-color'], migratableCount: 1, occurrenceCount: 1, unknownColoredCount: 0, messageIndexes: [1] }],
        stats: {},
    };
    const { doc, install, controllerCalls } = createTestHarness({ inventory });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const select = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-action-select');
    select.value = 'create';
    select.dispatchEvent(new FakeEvent('change'));

    assert.deepEqual(controllerCalls.setMapping, [{ sourceKey: 'gold', draft: { action: 'create', name: '', color: '' } }]);
    const inputs = FakePopup.instances[0].content.querySelectorAll('.chromatic-dialogue-migration-input');
    assert.equal(inputs.length, 2);
});

test('29. create name/color edits are passed raw to controller without normalization', () => {
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: 'gold', sourceValue: 'gold', adapters: ['html-font-color'], migratableCount: 1, occurrenceCount: 1, unknownColoredCount: 0, messageIndexes: [1] }],
        stats: {},
    };
    const { doc, install, controllerCalls } = createTestHarness({
        inventory,
        mappings: [{ sourceKey: 'gold', action: 'create', name: '', color: '' }],
    });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const [nameInput, colorInput] = FakePopup.instances[0].content.querySelectorAll('.chromatic-dialogue-migration-input');
    nameInput.value = ' Mara ';
    nameInput.dispatchEvent(new FakeEvent('input'));

    colorInput.value = '#ffd700';
    colorInput.dispatchEvent(new FakeEvent('input'));

    assert.deepEqual(controllerCalls.setMapping.at(-1), {
        sourceKey: 'gold',
        draft: { action: 'create', name: ' Mara ', color: '#ffd700' },
    });
});

test('30. Use Suggested Color requires explicit click before copying suggestedFinalColor', () => {
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: 'named:gold', sourceValue: 'gold', adapters: ['ff-named-color'], suggestedFinalColor: '#FFD700', migratableCount: 1, occurrenceCount: 1, unknownColoredCount: 0, messageIndexes: [1] }],
        stats: {},
    };
    const { doc, install, controllerCalls } = createTestHarness({
        inventory,
        mappings: [{ sourceKey: 'named:gold', action: 'create', name: 'Mara', color: '' }],
    });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const suggestBtn = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-suggestion-button');
    assert.match(suggestBtn.textContent, /Use Suggested Color/);

    suggestBtn.click();
    assert.deepEqual(controllerCalls.setMapping.at(-1), {
        sourceKey: 'named:gold',
        draft: { action: 'create', name: 'Mara', color: '#FFD700' },
    });
});

test('31. changing mapping action replaces draft; selecting blank clears mapping', () => {
    const inventory = {
        status: 'ready',
        groups: [{ sourceKey: 'gold', sourceValue: 'gold', adapters: ['html-font-color'], migratableCount: 1, occurrenceCount: 1, unknownColoredCount: 0, messageIndexes: [1] }],
        stats: {},
    };
    const { doc, install, controllerCalls } = createTestHarness({
        inventory,
        mappings: [{ sourceKey: 'gold', action: 'skip' }],
    });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const select = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-action-select');
    select.value = 'create';
    select.dispatchEvent(new FakeEvent('change'));
    assert.equal(controllerCalls.setMapping.at(-1).draft.action, 'create');

    select.value = '';
    select.dispatchEvent(new FakeEvent('change'));
    assert.deepEqual(controllerCalls.clearMapping, ['gold']);
});

test('32. existing assignment labels and mapping progress render from controller/inventory state', () => {
    const inventory = {
        status: 'ready',
        groups: [
            { sourceKey: 'k1', adapters: ['html-font-color'], migratableCount: 1 },
            { sourceKey: 'k2', adapters: ['html-font-color'], migratableCount: 1 },
        ],
        existingAssignments: [{ id: 'c1', name: 'Alice', color: '#112233' }],
        stats: {},
    };
    const { doc, install, mockController } = createTestHarness({
        inventory,
        requiredMappingCount: 2,
        completedMappingCount: 1,
        mappings: [{ sourceKey: 'k1', action: 'skip' }],
    });
    const frozenState = Object.freeze(mockController.getState());
    mockController.getState = () => frozenState;

    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const progress = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-progress');
    assert.equal(progress.textContent, '1 of 2 source groups mapped');
});

test('33. Preview button enabled state follows state.canPreview and delegates only to controller.preview', async () => {
    const inventory = { status: 'ready', groups: [], stats: {} };
    const { doc, install, mockController, controllerCalls } = createTestHarness({
        inventory,
        canPreview: false,
    });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const popup = FakePopup.instances[0];
    let previewBtn = popup.content.querySelector('.chromatic-dialogue-migration-preview-button');
    assert.equal(previewBtn.disabled, true);

    mockController._setState({ canPreview: true });
    const introToggle = popup.content.querySelector('#cd-migration-intro-toggle');
    introToggle.dispatchEvent(new FakeEvent('change'));
    await new Promise((r) => setTimeout(r, 0));

    previewBtn = popup.content.querySelector('.chromatic-dialogue-migration-preview-button');
    assert.equal(previewBtn.disabled, false);

    previewBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(controllerCalls.preview, 1);
});

test('34. plan-rejected errors/stale status render without silently rescanning or changing mappings', async () => {
    const inventory = { status: 'ready', groups: [], stats: {} };
    const { doc, install, mockController, controllerCalls } = createTestHarness({
        inventory,
        canPreview: true,
        mappings: [{ sourceKey: 'gold', action: 'create', name: '', color: '' }],
    });
    mockController.preview = async () => {
        mockController._setState({
            lastResult: {
                status: 'plan-rejected',
                errors: [{ code: 'invalid-name' }, { code: 'invalid-color' }],
            },
        });
        return { status: 'plan-rejected' };
    };

    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();
    const previewBtn = FakePopup.instances[0].content.querySelector('.chromatic-dialogue-migration-preview-button');
    previewBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(controllerCalls.scan, 1);
    assert.equal(mockController.getState().mappings.length, 1);
    const content = FakePopup.instances[0].content.textContent;
    assert.match(content, /Enter a character name/);
    assert.match(content, /Enter a valid six-digit hex color/);
});

test('35. ready preview renders stats, source plans, new assignments and reused assignments', () => {
    const inventory = { status: 'ready', groups: [], stats: {} };
    const preview = {
        status: 'ready',
        stats: {
            sourceGroupCount: 2,
            migratableSourceGroupCount: 2,
            mappedSourceGroupCount: 2,
            skippedSourceGroupCount: 0,
            newAssignmentCount: 1,
            reusedAssignmentCount: 1,
            changedMessageCount: 2,
            migratedOccurrenceCount: 4,
            skippedMigratableCount: 1,
            unknownColoredCount: 0,
            issueCount: 0,
        },
        newAssignments: [{ id: 'c4', name: 'Bob', color: '#123456' }],
        reusedAssignments: [{ id: 'c1', name: 'Alice', color: '#654321' }],
        sourcePlans: [
            { sourceKey: 'gold', action: 'create', allocatedAssignmentId: 'c4', name: 'Bob', color: '#123456' },
            { sourceKey: 'blue', action: 'reuse', assignmentId: 'c1', name: 'Alice', color: '#654321' },
        ],
        messageChanges: [],
    };
    const { doc, install } = createTestHarness({ inventory, preview, canApply: true });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const popupContent = FakePopup.instances[0].content.textContent;
    assert.match(popupContent, /Migration Preview/);
    assert.match(popupContent, /Changed messages: 2/);
    assert.match(popupContent, /Dialogue spans to migrate: 4/);
    assert.match(popupContent, /Skipped migratable spans: 1/);
    assert.match(popupContent, /New assignments: 1/);
    assert.match(popupContent, /Reused assignments: 1/);
    assert.match(popupContent, /Unknown colored content: 0/);
    assert.match(popupContent, /Scanner issues: 0/);
    assert.match(popupContent, /c4 — Bob — #123456/);
    assert.match(popupContent, /c1 — Alice — #654321/);
    assert.match(popupContent, /gold → create/);
    assert.match(popupContent, /blue → reuse/);
});

test('36. before/after strings containing HTML are shown as literal text in PRE elements', () => {
    const maliciousHtml = '<span style="color:red">legacy</span><script>alert(1)</script>';
    const inventory = { status: 'ready', groups: [], stats: {} };
    const preview = {
        status: 'ready',
        stats: {},
        newAssignments: [],
        reusedAssignments: [],
        sourcePlans: [],
        messageChanges: [
            { messageIndex: 1, role: 'assistant', before: maliciousHtml, after: 'cleaned', replacements: [] },
        ],
    };
    const { doc, install } = createTestHarness({ inventory, preview, canApply: true });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const popup = FakePopup.instances[0];
    assert.equal(popup.content.querySelectorAll('script').length, 0);
    const beforePre = popup.content.querySelector('.chromatic-dialogue-migration-before');
    assert.equal(beforePre.textContent, maliciousHtml);
    assert.equal(beforePre.children.length, 0);
});

test('37. message-change rendering is progressively limited initially and Show More increases presentation count without changing controller preview', () => {
    const inventory = { status: 'ready', groups: [], stats: {} };
    const messageChanges = Array.from({ length: 15 }, (_, i) => ({
        messageIndex: i,
        role: 'assistant',
        before: `before ${i}`,
        after: `after ${i}`,
        replacements: [],
    }));
    const preview = {
        status: 'ready',
        stats: { changedMessageCount: 15 },
        newAssignments: [],
        reusedAssignments: [],
        sourcePlans: [],
        messageChanges,
    };
    const { doc, install, mockController } = createTestHarness({ inventory, preview, canApply: true });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const popup = FakePopup.instances[0];
    let diffDetails = popup.content.querySelectorAll('.chromatic-dialogue-migration-diff-details');
    assert.equal(diffDetails.length, 10);

    const showMoreBtn = popup.content.querySelector('.chromatic-dialogue-migration-show-more');
    assert.ok(showMoreBtn);
    showMoreBtn.click();

    diffDetails = popup.content.querySelectorAll('.chromatic-dialogue-migration-diff-details');
    assert.equal(diffDetails.length, 15);
    assert.equal(mockController.getState().preview.messageChanges.length, 15);
});

test('38. Apply is shown only for ready actionable preview; native confirmation cancel prevents controller.apply, affirmative calls it once; busy disables controls', async () => {
    const inventory = { status: 'ready', groups: [], stats: {} };
    const noChangePreview = {
        status: 'ready',
        stats: { changedMessageCount: 0, newAssignmentCount: 0 },
        messageChanges: [],
        newAssignments: [],
    };
    const { doc, install, mockController, controllerCalls } = createTestHarness({
        inventory,
        preview: noChangePreview,
        canApply: true,
    });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const popup = FakePopup.instances[0];
    assert.match(popup.content.textContent, /Nothing will be changed by this plan/);
    assert.equal(popup.content.querySelector('.chromatic-dialogue-migration-apply-button'), null);

    const actionablePreview = {
        status: 'ready',
        stats: { changedMessageCount: 1, newAssignmentCount: 1, migratedOccurrenceCount: 2 },
        messageChanges: [{ messageIndex: 1, before: 'a', after: 'b' }],
        newAssignments: [{ id: 'c1', name: 'N', color: '#112233' }],
    };
    mockController._setState({ preview: actionablePreview });
    const introToggle = popup.content.querySelector('#cd-migration-intro-toggle');
    introToggle.dispatchEvent(new FakeEvent('change'));
    await new Promise((r) => setTimeout(r, 0));

    let applyBtn = popup.content.querySelector('.chromatic-dialogue-migration-apply-button');
    assert.ok(applyBtn);

    FakePopup.confirmResponse = POPUP_RESULT.CANCELLED;
    applyBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(controllerCalls.apply, 0);

    FakePopup.confirmResponse = POPUP_RESULT.AFFIRMATIVE;
    mockController.apply = async () => {
        controllerCalls.apply++;
        mockController._setState({ lastResult: { status: 'applied-undo-unavailable' } });
        return { status: 'applied-undo-unavailable' };
    };

    applyBtn = popup.content.querySelector('.chromatic-dialogue-migration-apply-button');
    applyBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(controllerCalls.apply, 1);
    const lastConfirmCall = FakePopup.confirmCalls.at(-1);
    assert.equal(lastConfirmCall.options.okButton, 'Apply Migration');
    assert.equal(lastConfirmCall.options.cancelButton, 'Cancel');
    assert.match(popup.content.textContent, /session undo could not be retained/i);
});

test('39. Undo visibility follows undoAvailable; confirmation delegates once to controller.undo; stale/success result statuses render correctly without implementing undo itself', async () => {
    const inventory = { status: 'ready', groups: [], stats: {} };
    const { doc, install, mockController, controllerCalls } = createTestHarness({
        inventory,
        undoAvailable: true,
    });
    install();
    doc.getElementById('chromatic-dialogue-migrate-legacy-dialogue').click();

    const popup = FakePopup.instances[0];
    let undoBtn = popup.content.querySelector('.chromatic-dialogue-migration-undo-button');
    assert.ok(undoBtn);

    FakePopup.confirmResponse = POPUP_RESULT.CANCELLED;
    undoBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(controllerCalls.undo, 0);

    FakePopup.confirmResponse = POPUP_RESULT.AFFIRMATIVE;
    mockController.undo = async () => {
        controllerCalls.undo++;
        mockController._setState({
            phase: 'error',
            lastResult: { status: 'stale-undo' },
            undoAvailable: false,
        });
        return { status: 'stale-undo' };
    };

    undoBtn = popup.content.querySelector('.chromatic-dialogue-migration-undo-button');
    undoBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(controllerCalls.undo, 1);
    const lastConfirmCall = FakePopup.confirmCalls.at(-1);
    assert.equal(lastConfirmCall.options.okButton, 'Undo Migration');
    assert.equal(lastConfirmCall.options.cancelButton, 'Cancel');
    assert.match(popup.content.textContent, /automatic undo was refused/);
    assert.equal(popup.content.querySelector('.chromatic-dialogue-migration-undo-button'), null);
});

test('40. architecture integration: index.js imports/calls installer exactly once in existing initializeOnce lifecycle; UI source imports only controller among migration layers, contains no direct saveChat/message.mes/CD_NEW/legacy parsing ownership; style.css adds scoped responsive wizard styles without changing manifest/version', async () => {
    const indexSource = await readFile(join(__dirname, '..', 'index.js'), 'utf8');
    const uiSource = await readFile(join(__dirname, '..', 'src', 'legacy-migration-wizard-ui.js'), 'utf8');
    const styleSource = await readFile(join(__dirname, '..', 'style.css'), 'utf8');
    const manifestJson = JSON.parse(await readFile(join(__dirname, '..', 'manifest.json'), 'utf8'));

    assert.match(indexSource, /import\s*\{\s*installLegacyMigrationWizardUI\s*\}\s*from\s*'\.\/src\/legacy-migration-wizard-ui\.js'/);
    assert.match(indexSource, /installLegacyMigrationWizardUI\(\)/);

    assert.doesNotMatch(uiSource, /from\s*['"]\.\/legacy-dialogue-scanner\.js['"]/);
    assert.doesNotMatch(uiSource, /from\s*['"]\.\/legacy-chat-inventory\.js['"]/);
    assert.doesNotMatch(uiSource, /from\s*['"]\.\/legacy-migration-planner\.js['"]/);
    assert.doesNotMatch(uiSource, /from\s*['"]\.\/legacy-migration-service\.js['"]/);
    assert.doesNotMatch(uiSource, /from\s*['"]\.\/legacy-migration-undo-store\.js['"]/);

    assert.doesNotMatch(uiSource, /saveChat/);
    assert.doesNotMatch(uiSource, /saveMetadata/);
    assert.doesNotMatch(uiSource, /saveActiveChatState/);
    assert.doesNotMatch(uiSource, /message\.mes/);
    assert.doesNotMatch(uiSource, /CD_NEW/);
    assert.doesNotMatch(uiSource, /window\.confirm/);
    assert.doesNotMatch(uiSource, /localStorage/);
    assert.doesNotMatch(uiSource, /sessionStorage/);
    assert.doesNotMatch(uiSource, /indexedDB/);
    assert.doesNotMatch(uiSource, /MutationObserver/);
    assert.doesNotMatch(uiSource, /setInterval/);
    assert.doesNotMatch(uiSource, /toastr/);
    assert.doesNotMatch(uiSource, /scripts\//);

    assert.match(styleSource, /\.chromatic-dialogue-migration-wizard/);
    assert.match(styleSource, /container-type:\s*inline-size/);

    assert.equal(manifestJson.version, '1.1.1');
});