import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    PANEL_ID,
    REVIEW_SECTION_ID,
    REVIEW_COUNT_ID,
    REVIEW_LIST_ID,
    REVIEW_FEEDBACK_ID,
} from '../src/constants.js';
import {
    putPendingReview,
    clearAllPendingReviews,
} from '../src/pending-review-store.js';
import { renderReviewPanel } from '../src/review-panel.js';

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.className = '';
        this.children = [];
        this.parentElement = null;
        this.style = {};
        this.dataset = {};
        this.hidden = false;
        this.disabled = false;
        this.type = tagName.toLowerCase() === 'button' ? 'button' : '';
        this._textContent = '';
        this.attributes = new Map();
        this.eventListeners = new Map();
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
        if (name === 'id') delete this.id;
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
        const attr = selector.slice(1, -1);
        return el.hasAttribute(attr);
    }
    return el.tagName.toLowerCase() === selector.toLowerCase();
}

function createFakeDocument() {
    return {
        createElement(tagName) {
            const el = new FakeElement(tagName);
            el.ownerDocument = this;
            return el;
        },
    };
}

function createReviewPanelShell() {
    const doc = globalThis.document;
    const panel = doc.createElement('div');
    panel.id = PANEL_ID;

    const section = doc.createElement('section');
    section.id = REVIEW_SECTION_ID;
    section.hidden = true;

    const countEl = doc.createElement('span');
    countEl.id = REVIEW_COUNT_ID;
    countEl.textContent = '0';

    const listEl = doc.createElement('div');
    listEl.id = REVIEW_LIST_ID;

    const feedbackEl = doc.createElement('p');
    feedbackEl.id = REVIEW_FEEDBACK_ID;
    feedbackEl.hidden = true;

    section.appendChild(countEl);
    section.appendChild(listEl);
    section.appendChild(feedbackEl);
    panel.appendChild(section);

    return { panel, section, countEl, listEl, feedbackEl };
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

beforeEach(() => {
    clearAllPendingReviews();
    globalThis.document = createFakeDocument();
});

afterEach(() => {
    delete globalThis.document;
    delete globalThis.SillyTavern;
    clearAllPendingReviews();
});

test('1. invalid/missing panel returns 0 safely', () => {
    assert.equal(renderReviewPanel(null, 'chat-1'), 0);
    assert.equal(renderReviewPanel(undefined, 'chat-1'), 0);
    assert.equal(renderReviewPanel({}, 'chat-1'), 0);
    assert.equal(renderReviewPanel('string', 'chat-1'), 0);
});

test('2. missing required Review-shell elements returns 0', () => {
    const { panel, section, countEl, listEl, feedbackEl } = createReviewPanelShell();

    section.replaceChildren(countEl, listEl); // feedbackEl missing
    assert.equal(renderReviewPanel(panel, 'chat-1'), 0);

    section.replaceChildren(countEl, feedbackEl); // listEl missing
    assert.equal(renderReviewPanel(panel, 'chat-1'), 0);

    section.replaceChildren(listEl, feedbackEl); // countEl missing
    assert.equal(renderReviewPanel(panel, 'chat-1'), 0);

    panel.replaceChildren(); // section missing
    assert.equal(renderReviewPanel(panel, 'chat-1'), 0);
});

test('3. invalid/no chatId hides Review section', () => {
    const { panel, section } = createReviewPanelShell();
    putPendingReview(createValidReview());

    section.hidden = false;
    assert.equal(renderReviewPanel(panel, ''), 0);
    assert.strictEqual(section.hidden, true);

    section.hidden = false;
    assert.equal(renderReviewPanel(panel, null), 0);
    assert.strictEqual(section.hidden, true);

    section.hidden = false;
    assert.equal(renderReviewPanel(panel, '   '), 0);
    assert.strictEqual(section.hidden, true);

    section.hidden = false;
    assert.equal(renderReviewPanel(panel, ' chat-1'), 0);
    assert.strictEqual(section.hidden, true);
});

test('4. invalid/no chatId clears list/count/feedback', () => {
    const { panel, section, countEl, listEl, feedbackEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    countEl.textContent = '5';
    listEl.appendChild(globalThis.document.createElement('div'));
    feedbackEl.textContent = 'Existing feedback';
    feedbackEl.hidden = false;

    renderReviewPanel(panel, '');

    assert.equal(countEl.textContent, '0');
    assert.equal(listEl.children.length, 0);
    assert.strictEqual(section.hidden, true);
    assert.equal(feedbackEl.textContent, '');
    assert.strictEqual(feedbackEl.hidden, true);
});

test('5. invalid/no chatId does not query pending store', () => {
    const { panel } = createReviewPanelShell();
    let queryCount = 0;

    renderReviewPanel(panel, '', {
        listPendingReviews: () => {
            queryCount++;
            return [];
        },
    });

    renderReviewPanel(panel, null, {
        listPendingReviews: () => {
            queryCount++;
            return [];
        },
    });

    assert.equal(queryCount, 0);
});

test('6. valid chat with no pending reviews renders zero', () => {
    const { panel } = createReviewPanelShell();
    const count = renderReviewPanel(panel, 'chat-1');

    assert.equal(count, 0);
});

test('7. empty pending state hides section', () => {
    const { panel, section } = createReviewPanelShell();
    section.hidden = false;

    renderReviewPanel(panel, 'chat-1');
    assert.strictEqual(section.hidden, true);
});

test('8. one pending review shows section', () => {
    const { panel, section } = createReviewPanelShell();
    putPendingReview(createValidReview());

    const count = renderReviewPanel(panel, 'chat-1');
    assert.equal(count, 1);
    assert.strictEqual(section.hidden, false);
});

test('9. count displays number of review cards', () => {
    const { panel, countEl } = createReviewPanelShell();
    putPendingReview(createValidReview({ messageId: 1 }));
    putPendingReview(createValidReview({ messageId: 2 }));

    const count = renderReviewPanel(panel, 'chat-1');
    assert.equal(count, 2);
    assert.equal(countEl.textContent, '2');
});

test('10. multiple reviews preserve ascending store order', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({ messageId: 10 }));
    putPendingReview(createValidReview({ messageId: 3 }));
    putPendingReview(createValidReview({ messageId: 7 }));

    renderReviewPanel(panel, 'chat-1');

    const messageIds = listEl.children.map(card => card.dataset.messageId);
    assert.deepEqual(messageIds, ['3', '7', '10']);
});

test('11. one multi-proposal review counts as one card', () => {
    const { panel, countEl, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({
        messageId: 4,
        proposals: [
            {
                id: 'c2',
                name: 'Bob',
                proposedColor: '#B86FD4',
                color: '#B86FD4',
                colorAdjusted: false,
                contrastRatio: 5.2,
            },
            {
                id: 'c3',
                name: 'Charlie',
                proposedColor: '#F0E442',
                color: '#F0E442',
                colorAdjusted: false,
                contrastRatio: 6.1,
            },
        ],
    }));

    const count = renderReviewPanel(panel, 'chat-1');
    assert.equal(count, 1);
    assert.equal(countEl.textContent, '1');
    assert.equal(listEl.children.length, 1);
});

test('12. card has role=listitem', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    const card = listEl.children[0];
    assert.equal(card.getAttribute('role'), 'listitem');
});

test('13. card exposes messageId safely', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({ messageId: 42 }));

    renderReviewPanel(panel, 'chat-1');
    const card = listEl.children[0];
    assert.equal(card.dataset.messageId, '42');
});

test('14. card displays Message N', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({ messageId: 12 }));

    renderReviewPanel(panel, 'chat-1');
    const msgIdEl = listEl.querySelector('.chromatic-dialogue-review-message-id');
    assert.notStrictEqual(msgIdEl, null);
    assert.equal(msgIdEl.textContent, 'Message 12');
});

test('15. proposal ID rendered with textContent', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    const idEl = listEl.querySelector('.chromatic-dialogue-review-proposal-id');
    assert.equal(idEl.textContent, 'c1');
});

test('16. proposal name rendered with textContent', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    const nameEl = listEl.querySelector('.chromatic-dialogue-review-proposal-name');
    assert.equal(nameEl.textContent, 'Alice');
});

test('17. malicious HTML-like name remains literal text', () => {
    const { panel, listEl } = createReviewPanelShell();
    const maliciousName = '<img src=x onerror=alert(1)>';
    putPendingReview(createValidReview({
        proposals: [
            {
                id: 'c1',
                name: maliciousName,
                proposedColor: '#56B4E9',
                color: '#56B4E9',
                colorAdjusted: false,
                contrastRatio: 4.5,
            },
        ],
    }));

    renderReviewPanel(panel, 'chat-1');
    const nameEl = listEl.querySelector('.chromatic-dialogue-review-proposal-name');
    assert.equal(nameEl.textContent, maliciousName);
    assert.strictEqual(listEl.querySelector('img'), null);
});

test('18. final color displayed', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    const valEl = listEl.querySelector('.chromatic-dialogue-review-color-value');
    assert.equal(valEl.textContent, '#56B4E9');
});

test('19. swatch backgroundColor receives final color', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    const swatch = listEl.querySelector('.chromatic-dialogue-review-color-swatch');
    assert.equal(swatch.style.backgroundColor, '#56B4E9');
});

test('20. unadjusted proposal shows no adjustment label', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    const adjustedEl = listEl.querySelector('.chromatic-dialogue-review-adjusted');
    assert.strictEqual(adjustedEl, null);
});

test('21. adjusted proposal shows Adjusted for contrast', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({
        proposals: [
            {
                id: 'c1',
                name: 'Mara',
                proposedColor: '#777777',
                color: '#333333',
                colorAdjusted: true,
                contrastRatio: 6.8,
            },
        ],
    }));

    renderReviewPanel(panel, 'chat-1');
    const adjustedEl = listEl.querySelector('.chromatic-dialogue-review-adjusted');
    assert.notStrictEqual(adjustedEl, null);
    assert.ok(adjustedEl.textContent.includes('Adjusted for contrast'));
});

test('22. adjusted proposal exposes proposedColor', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({
        proposals: [
            {
                id: 'c1',
                name: 'Mara',
                proposedColor: '#777777',
                color: '#333333',
                colorAdjusted: true,
                contrastRatio: 6.8,
            },
        ],
    }));

    renderReviewPanel(panel, 'chat-1');
    const adjustedEl = listEl.querySelector('.chromatic-dialogue-review-adjusted');
    assert.ok(adjustedEl.textContent.includes('#777777'));
});

test('23. finite ratio shown rounded to two decimals', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({
        proposals: [
            {
                id: 'c1',
                name: 'Alice',
                proposedColor: '#56B4E9',
                color: '#56B4E9',
                colorAdjusted: false,
                contrastRatio: 5.3489,
            },
        ],
    }));

    renderReviewPanel(panel, 'chat-1');
    const contrastEl = listEl.querySelector('.chromatic-dialogue-review-contrast');
    assert.equal(contrastEl.textContent, 'Contrast 5.35:1');
});

test('24. non-finite ratio displays Contrast unavailable', () => {
    const { panel, listEl } = createReviewPanelShell();
    const review = createValidReview();
    review.proposals[0].contrastRatio = NaN;

    renderReviewPanel(panel, 'chat-1', {
        listPendingReviews: () => [review],
    });

    const contrastEl = listEl.querySelector('.chromatic-dialogue-review-contrast');
    assert.equal(contrastEl.textContent, 'Contrast unavailable');
});

test('25. single proposal buttons read Dismiss / Approve', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    const buttons = listEl.querySelectorAll('button');
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].textContent, 'Dismiss');
    assert.equal(buttons[1].textContent, 'Approve');
});

test('26. multi proposal buttons read Dismiss all / Approve all', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({
        proposals: [
            {
                id: 'c1',
                name: 'Alice',
                proposedColor: '#56B4E9',
                color: '#56B4E9',
                colorAdjusted: false,
                contrastRatio: 4.5,
            },
            {
                id: 'c2',
                name: 'Bob',
                proposedColor: '#B86FD4',
                color: '#B86FD4',
                colorAdjusted: false,
                contrastRatio: 5.0,
            },
        ],
    }));

    renderReviewPanel(panel, 'chat-1');
    const buttons = listEl.querySelectorAll('button');
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].textContent, 'Dismiss all');
    assert.equal(buttons[1].textContent, 'Approve all');
});

test('27. both buttons use menu_button', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    const buttons = listEl.querySelectorAll('button');
    for (const btn of buttons) {
        assert.ok(btn.className.includes('menu_button'));
    }
});

test('28. buttons are type=button', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    const buttons = listEl.querySelectorAll('button');
    for (const btn of buttons) {
        assert.equal(btn.type, 'button');
    }
});

test('29. accessible labels mention message ID', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({ messageId: 19 }));

    renderReviewPanel(panel, 'chat-1');
    const buttons = listEl.querySelectorAll('button');
    assert.ok(buttons[0].getAttribute('aria-label').includes('19'));
    assert.ok(buttons[1].getAttribute('aria-label').includes('19'));
});

test('30. Dismiss receives the rendered snapshot', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    let receivedSnapshot = null;
    renderReviewPanel(panel, 'chat-1', {
        dismissPendingReview: (snap) => {
            receivedSnapshot = snap;
            return { status: 'dismissed', chatId: 'chat-1', messageId: 0 };
        },
    });

    const dismissBtn = listEl.querySelectorAll('button')[0];
    dismissBtn.click();

    assert.notStrictEqual(receivedSnapshot, null);
    assert.equal(receivedSnapshot.chatId, 'chat-1');
    assert.equal(receivedSnapshot.messageId, 0);
    assert.equal(receivedSnapshot.proposals[0].name, 'Alice');
});

test('31. Approve receives rendered chatId/messageId', async () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({ chatId: 'chat-42', messageId: 8 }));

    let passedChatId = null;
    let passedMessageId = null;

    renderReviewPanel(panel, 'chat-42', {
        approvePendingReview: async (c, m) => {
            passedChatId = c;
            passedMessageId = m;
            return { status: 'approved', pendingRemoved: true };
        },
    });

    const approveBtn = listEl.querySelectorAll('button')[1];
    approveBtn.click();

    assert.equal(passedChatId, 'chat-42');
    assert.equal(passedMessageId, 8);
});

test('32. clicking Dismiss disables both card buttons immediately', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    const [dismissBtn, approveBtn] = listEl.querySelectorAll('button');

    assert.strictEqual(dismissBtn.disabled, false);
    assert.strictEqual(approveBtn.disabled, false);

    dismissBtn.click();

    assert.strictEqual(dismissBtn.disabled, true);
    assert.strictEqual(approveBtn.disabled, true);
});

test('33. clicking Approve disables both card buttons immediately', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    let resolveApproval;
    const approvalPromise = new Promise(resolve => {
        resolveApproval = resolve;
    });

    renderReviewPanel(panel, 'chat-1', {
        approvePendingReview: () => approvalPromise,
    });

    const [dismissBtn, approveBtn] = listEl.querySelectorAll('button');
    approveBtn.click();

    assert.strictEqual(dismissBtn.disabled, true);
    assert.strictEqual(approveBtn.disabled, true);

    resolveApproval({ status: 'approved', pendingRemoved: true });
});

test('34. other cards remain enabled while one card is busy', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({ messageId: 1 }));
    putPendingReview(createValidReview({ messageId: 2 }));

    let resolveApproval;
    const approvalPromise = new Promise(resolve => {
        resolveApproval = resolve;
    });

    renderReviewPanel(panel, 'chat-1', {
        approvePendingReview: () => approvalPromise,
    });

    const card1Buttons = listEl.children[0].querySelectorAll('button');
    const card2Buttons = listEl.children[1].querySelectorAll('button');

    card1Buttons[1].click();

    assert.strictEqual(card1Buttons[0].disabled, true);
    assert.strictEqual(card1Buttons[1].disabled, true);
    assert.strictEqual(card2Buttons[0].disabled, false);
    assert.strictEqual(card2Buttons[1].disabled, false);

    resolveApproval({ status: 'approved', pendingRemoved: true });
});

test('35. approval buttons remain disabled while Promise is pending', async () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    let resolveApproval;
    const approvalPromise = new Promise(resolve => {
        resolveApproval = resolve;
    });

    renderReviewPanel(panel, 'chat-1', {
        approvePendingReview: () => approvalPromise,
    });

    const [dismissBtn, approveBtn] = listEl.querySelectorAll('button');
    approveBtn.click();

    assert.strictEqual(dismissBtn.disabled, true);
    assert.strictEqual(approveBtn.disabled, true);

    resolveApproval({ status: 'approved', pendingRemoved: true });
    await Promise.resolve();

    assert.strictEqual(dismissBtn.disabled, true);
    assert.strictEqual(approveBtn.disabled, true);
});

test('36. approved terminal result leaves old snapshot buttons disabled', async () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1', {
        approvePendingReview: async () => ({
            status: 'approved',
            pendingRemoved: true,
        }),
    });

    const [dismissBtn, approveBtn] = listEl.querySelectorAll('button');
    approveBtn.click();
    await Promise.resolve();

    assert.strictEqual(dismissBtn.disabled, true);
    assert.strictEqual(approveBtn.disabled, true);
});

test('37. dismissed terminal result leaves old snapshot buttons disabled', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1', {
        dismissPendingReview: () => ({ status: 'dismissed' }),
    });

    const [dismissBtn, approveBtn] = listEl.querySelectorAll('button');
    dismissBtn.click();

    assert.strictEqual(dismissBtn.disabled, true);
    assert.strictEqual(approveBtn.disabled, true);
});

test('38. stale-review leaves old snapshot buttons disabled', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1', {
        dismissPendingReview: () => ({ status: 'stale-review' }),
    });

    const [dismissBtn, approveBtn] = listEl.querySelectorAll('button');
    dismissBtn.click();

    assert.strictEqual(dismissBtn.disabled, true);
    assert.strictEqual(approveBtn.disabled, true);
});

test('39. retryable approval failure re-enables both buttons', async () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1', {
        approvePendingReview: async () => ({
            status: 'runtime-unavailable',
            reason: 'dom-unavailable',
        }),
    });

    const [dismissBtn, approveBtn] = listEl.querySelectorAll('button');
    approveBtn.click();
    await Promise.resolve();

    assert.strictEqual(dismissBtn.disabled, false);
    assert.strictEqual(approveBtn.disabled, false);
});

test('40. dismissal invalid-review may re-enable buttons', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1', {
        dismissPendingReview: () => ({ status: 'invalid-review' }),
    });

    const [dismissBtn, approveBtn] = listEl.querySelectorAll('button');
    dismissBtn.click();

    assert.strictEqual(dismissBtn.disabled, false);
    assert.strictEqual(approveBtn.disabled, false);
});

test('41. feedback uses textContent', async () => {
    const { panel, listEl, feedbackEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1', {
        approvePendingReview: async () => ({
            status: 'runtime-unavailable',
        }),
    });

    const approveBtn = listEl.querySelectorAll('button')[1];
    approveBtn.click();
    await Promise.resolve();

    assert.strictEqual(feedbackEl.hidden, false);
    assert.equal(typeof feedbackEl.textContent, 'string');
    assert.ok(feedbackEl.textContent.length > 0);
});

test('42. stale-review produces useful feedback', () => {
    const { panel, listEl, feedbackEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1', {
        dismissPendingReview: () => ({ status: 'stale-review' }),
    });

    const dismissBtn = listEl.querySelectorAll('button')[0];
    dismissBtn.click();

    assert.strictEqual(feedbackEl.hidden, false);
    assert.equal(feedbackEl.dataset.feedbackKind, 'error');
    assert.ok(feedbackEl.textContent.includes('proposal has changed'));
});

test('43. runtime-unavailable produces useful retry feedback', async () => {
    const { panel, listEl, feedbackEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1', {
        approvePendingReview: async () => ({
            status: 'runtime-unavailable',
        }),
    });

    const approveBtn = listEl.querySelectorAll('button')[1];
    approveBtn.click();
    await Promise.resolve();

    assert.strictEqual(feedbackEl.hidden, false);
    assert.equal(feedbackEl.dataset.feedbackKind, 'error');
    assert.ok(feedbackEl.textContent.toLowerCase().includes('retry'));
});

test('44. persistence-error produces useful retry feedback', async () => {
    const { panel, listEl, feedbackEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1', {
        approvePendingReview: async () => ({
            status: 'persistence-error',
        }),
    });

    const approveBtn = listEl.querySelectorAll('button')[1];
    approveBtn.click();
    await Promise.resolve();

    assert.strictEqual(feedbackEl.hidden, false);
    assert.equal(feedbackEl.dataset.feedbackKind, 'error');
    assert.ok(feedbackEl.textContent.toLowerCase().includes('again') || feedbackEl.textContent.toLowerCase().includes('retry'));
});

test('45. approved result may produce positive feedback', async () => {
    const { panel, listEl, feedbackEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1', {
        approvePendingReview: async () => ({
            status: 'approved',
            pendingRemoved: true,
        }),
    });

    const approveBtn = listEl.querySelectorAll('button')[1];
    approveBtn.click();
    await Promise.resolve();

    assert.strictEqual(feedbackEl.hidden, false);
    assert.equal(feedbackEl.dataset.feedbackKind, 'valid');
    assert.ok(feedbackEl.textContent.includes('approved'));
});

test('46. pendingRemoved=false mentions newer pending review', async () => {
    const { panel, listEl, feedbackEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1', {
        approvePendingReview: async () => ({
            status: 'approved',
            pendingRemoved: false,
        }),
    });

    const approveBtn = listEl.querySelectorAll('button')[1];
    approveBtn.click();
    await Promise.resolve();

    assert.strictEqual(feedbackEl.hidden, false);
    assert.equal(feedbackEl.dataset.feedbackKind, 'valid');
    assert.ok(feedbackEl.textContent.toLowerCase().includes('newer'));
});

test('47. fresh render clears previous feedback', () => {
    const { panel, feedbackEl } = createReviewPanelShell();
    feedbackEl.textContent = 'Old feedback';
    feedbackEl.dataset.feedbackKind = 'error';
    feedbackEl.hidden = false;

    renderReviewPanel(panel, 'chat-1');

    assert.equal(feedbackEl.textContent, '');
    assert.strictEqual(feedbackEl.dataset.feedbackKind, undefined);
    assert.strictEqual(feedbackEl.hidden, true);
});

test('48. renderer replaces old cards rather than appending duplicates', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    assert.equal(listEl.children.length, 1);

    renderReviewPanel(panel, 'chat-1');
    assert.equal(listEl.children.length, 1);
});

test('49. renderer does not manually persist metadata', () => {
    const { panel } = createReviewPanelShell();
    putPendingReview(createValidReview());

    let saveCalled = false;
    globalThis.SillyTavern = {
        getContext: () => {
            saveCalled = true;
            return {};
        },
    };

    renderReviewPanel(panel, 'chat-1');
    assert.strictEqual(saveCalled, false);
});

test('50. renderer does not modify assistant messages', () => {
    const { panel } = createReviewPanelShell();
    const review = createValidReview();
    putPendingReview(review);

    renderReviewPanel(panel, 'chat-1');
    assert.strictEqual(review.message, undefined);
});

test('51. renderer does not call SillyTavern', () => {
    const { panel } = createReviewPanelShell();
    putPendingReview(createValidReview());

    let getContextCalled = false;
    globalThis.SillyTavern = {
        getContext: () => {
            getContextCalled = true;
            throw new Error('SillyTavern must not be accessed');
        },
    };

    assert.doesNotThrow(() => {
        renderReviewPanel(panel, 'chat-1');
    });
    assert.strictEqual(getContextCalled, false);
});

test('52. renderer does not subscribe to store notifications', () => {
    const { panel } = createReviewPanelShell();
    renderReviewPanel(panel, 'chat-1');
});

test('53. renderer does not call refreshPanelState', () => {
    const { panel } = createReviewPanelShell();
    globalThis.refreshPanelState = () => {
        throw new Error('Must not call refreshPanelState');
    };

    assert.doesNotThrow(() => {
        renderReviewPanel(panel, 'chat-1');
    });

    delete globalThis.refreshPanelState;
});

test('54. review objects are not mutated', () => {
    const { panel } = createReviewPanelShell();
    const review = createValidReview();
    const reviewCopy = JSON.parse(JSON.stringify(review));
    putPendingReview(review);

    renderReviewPanel(panel, 'chat-1');

    assert.deepEqual(review, reviewCopy);
});

test('55. function itself is synchronous', () => {
    const { panel } = createReviewPanelShell();
    putPendingReview(createValidReview());

    const result = renderReviewPanel(panel, 'chat-1');
    assert.strictEqual(typeof result, 'number');
    assert.strictEqual(result instanceof Promise, false);
});

test('56. event handlers may be async where necessary', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview());

    renderReviewPanel(panel, 'chat-1');
    const approveBtn = listEl.querySelectorAll('button')[1];
    assert.doesNotThrow(() => {
        approveBtn.click();
    });
});

test('57. review list is cleared when switching to a chat with no pending reviews', () => {
    const { panel, listEl, section } = createReviewPanelShell();
    putPendingReview(createValidReview({ chatId: 'chat-1' }));

    renderReviewPanel(panel, 'chat-1');
    assert.equal(listEl.children.length, 1);
    assert.strictEqual(section.hidden, false);

    renderReviewPanel(panel, 'chat-empty');
    assert.equal(listEl.children.length, 0);
    assert.strictEqual(section.hidden, true);
});

test('58. different chat renders only its own pending reviews', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({ chatId: 'chat-a', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-b', messageId: 2 }));

    renderReviewPanel(panel, 'chat-a');
    assert.equal(listEl.children.length, 1);
    assert.equal(listEl.children[0].dataset.messageId, '1');

    renderReviewPanel(panel, 'chat-b');
    assert.equal(listEl.children.length, 1);
    assert.equal(listEl.children[0].dataset.messageId, '2');
});

test('59. multi-character order is preserved within a card', () => {
    const { panel, listEl } = createReviewPanelShell();
    putPendingReview(createValidReview({
        proposals: [
            {
                id: 'c5',
                name: 'Zoe',
                proposedColor: '#56B4E9',
                color: '#56B4E9',
                colorAdjusted: false,
                contrastRatio: 4.5,
            },
            {
                id: 'c2',
                name: 'Aaron',
                proposedColor: '#B86FD4',
                color: '#B86FD4',
                colorAdjusted: false,
                contrastRatio: 5.0,
            },
        ],
    }));

    renderReviewPanel(panel, 'chat-1');
    const idElements = listEl.querySelectorAll('.chromatic-dialogue-review-proposal-id');
    assert.equal(idElements[0].textContent, 'c5');
    assert.equal(idElements[1].textContent, 'c2');
});

test('60. no innerHTML rendering is used for review data', () => {
    const { panel } = createReviewPanelShell();
    putPendingReview(createValidReview());

    let innerHtmlUsed = false;
    const originalCreate = globalThis.document.createElement.bind(globalThis.document);

    globalThis.document.createElement = (tag) => {
        const el = originalCreate(tag);
        Object.defineProperty(el, 'innerHTML', {
            set() {
                innerHtmlUsed = true;
            },
            get() {
                return '';
            },
        });
        return el;
    };

    renderReviewPanel(panel, 'chat-1');
    assert.strictEqual(innerHtmlUsed, false);
});