import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { refreshOperationModeControl } from '../src/mode-panel.js';

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function delay() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function createFakePanel(options = {}) {
    const listeners = { change: [] };
    const select = options.hasSelect !== false ? {
        id: 'chromatic-dialogue-operation-mode',
        value: options.initialValue ?? 'review',
        disabled: options.initialDisabled ?? true,
        addEventListener(event, handler) {
            listeners[event] = listeners[event] || [];
            listeners[event].push(handler);
        },
        dispatchEvent(event) {
            const handlers = listeners[event.type] || [];
            for (const handler of handlers) {
                handler(event);
            }
        },
        get changeListeners() {
            return listeners.change || [];
        },
    } : null;

    let currentText = '';
    const feedback = options.hasFeedback !== false ? {
        id: 'chromatic-dialogue-operation-mode-feedback',
        dataset: {},
        hidden: true,
        get textContent() {
            return currentText;
        },
        set textContent(val) {
            currentText = String(val);
        },
        get innerHTML() {
            return currentText;
        },
        set innerHTML(_val) {
            throw new Error('innerHTML must not be used');
        },
    } : null;

    const panel = {
        querySelector(selector) {
            if (selector === '#chromatic-dialogue-operation-mode') {
                return select;
            }
            if (selector === '#chromatic-dialogue-operation-mode-feedback') {
                return feedback;
            }
            return null;
        },
    };

    return { panel, select, feedback };
}

test('1: missing panel returns safely without throwing', () => {
    assert.doesNotThrow(() => {
        refreshOperationModeControl(null);
        refreshOperationModeControl(undefined);
        refreshOperationModeControl({});
    });
});

test('2: missing select returns safely without throwing', () => {
    const { panel } = createFakePanel({ hasSelect: false });
    assert.doesNotThrow(() => {
        refreshOperationModeControl(panel);
    });
});

test('3: missing feedback returns safely without throwing', () => {
    const { panel } = createFakePanel({ hasFeedback: false });
    assert.doesNotThrow(() => {
        refreshOperationModeControl(panel);
    });
});

test('4: active Review renders Review', () => {
    const { panel, select } = createFakePanel();
    const deps = {
        readActiveChatMode: () => ({
            status: 'ready',
            chatId: 'chat-1',
            mode: 'review',
        }),
    };
    refreshOperationModeControl(panel, deps);
    assert.equal(select.value, 'review');
});

test('5: active Off renders Off', () => {
    const { panel, select } = createFakePanel();
    const deps = {
        readActiveChatMode: () => ({
            status: 'ready',
            chatId: 'chat-1',
            mode: 'off',
        }),
    };
    refreshOperationModeControl(panel, deps);
    assert.equal(select.value, 'off');
});

test('6: active Automatic renders Automatic', () => {
    const { panel, select } = createFakePanel();
    const deps = {
        readActiveChatMode: () => ({
            status: 'ready',
            chatId: 'chat-1',
            mode: 'automatic',
        }),
    };
    refreshOperationModeControl(panel, deps);
    assert.equal(select.value, 'automatic');
});

test('7: active chat enables selector', () => {
    const { panel, select } = createFakePanel({ initialDisabled: true });
    const deps = {
        readActiveChatMode: () => ({
            status: 'ready',
            chatId: 'chat-1',
            mode: 'review',
        }),
    };
    refreshOperationModeControl(panel, deps);
    assert.equal(select.disabled, false);
});

test('8: no chat renders Review visual default', () => {
    const { panel, select } = createFakePanel({ initialValue: 'off' });
    const deps = {
        readActiveChatMode: () => ({
            status: 'no-chat',
            chatId: null,
            mode: null,
        }),
    };
    refreshOperationModeControl(panel, deps);
    assert.equal(select.value, 'review');
});

test('9: no chat disables selector', () => {
    const { panel, select } = createFakePanel({ initialDisabled: false });
    const deps = {
        readActiveChatMode: () => ({
            status: 'no-chat',
            chatId: null,
            mode: null,
        }),
    };
    refreshOperationModeControl(panel, deps);
    assert.equal(select.disabled, true);
});

test('10: no chat clears feedback', () => {
    const { panel, feedback } = createFakePanel();
    feedback.textContent = 'Prior status';
    feedback.dataset.feedbackKind = 'valid';
    feedback.hidden = false;

    const deps = {
        readActiveChatMode: () => ({
            status: 'no-chat',
            chatId: null,
            mode: null,
        }),
    };
    refreshOperationModeControl(panel, deps);
    assert.equal(feedback.textContent, '');
    assert.equal(feedback.dataset.feedbackKind, undefined);
    assert.equal(feedback.hidden, true);
});

test('11: refresh reads fresh mode every call', () => {
    const { panel, select } = createFakePanel();
    let currentMode = 'off';
    let reads = 0;
    const deps = {
        readActiveChatMode: () => {
            reads++;
            return {
                status: 'ready',
                chatId: 'chat-1',
                mode: currentMode,
            };
        },
    };
    refreshOperationModeControl(panel, deps);
    assert.equal(select.value, 'off');
    assert.equal(reads, 1);

    currentMode = 'automatic';
    refreshOperationModeControl(panel, deps);
    assert.equal(select.value, 'automatic');
    assert.equal(reads, 2);
});

test('12: switching chats displays each chat\'s independent mode', () => {
    const { panel, select } = createFakePanel();
    let currentChat = { status: 'ready', chatId: 'chat-A', mode: 'off' };
    const deps = {
        readActiveChatMode: () => currentChat,
    };
    refreshOperationModeControl(panel, deps);
    assert.equal(select.value, 'off');

    currentChat = { status: 'ready', chatId: 'chat-B', mode: 'automatic' };
    refreshOperationModeControl(panel, deps);
    assert.equal(select.value, 'automatic');
});

test('13: chat switch clears prior feedback', () => {
    const { panel, feedback } = createFakePanel();
    let currentChat = { status: 'ready', chatId: 'chat-A', mode: 'review' };
    const deps = {
        readActiveChatMode: () => currentChat,
    };
    refreshOperationModeControl(panel, deps);
    feedback.textContent = 'Operation mode saved: Review.';
    feedback.dataset.feedbackKind = 'valid';
    feedback.hidden = false;

    currentChat = { status: 'ready', chatId: 'chat-B', mode: 'review' };
    refreshOperationModeControl(panel, deps);
    assert.equal(feedback.textContent, '');
    assert.equal(feedback.dataset.feedbackKind, undefined);
    assert.equal(feedback.hidden, true);
});

test('14: exactly one change listener registered', () => {
    const { panel, select } = createFakePanel();
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
    };
    refreshOperationModeControl(panel, deps);
    assert.equal(select.changeListeners.length, 1);
});

test('15: repeated refresh does not duplicate listener', () => {
    const { panel, select } = createFakePanel();
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
    };
    refreshOperationModeControl(panel, deps);
    refreshOperationModeControl(panel, deps);
    refreshOperationModeControl(panel, deps);
    assert.equal(select.changeListeners.length, 1);
});

test('16: change handler fresh-reads origin chat', async () => {
    const { panel, select } = createFakePanel();
    let activeChat = { status: 'ready', chatId: 'chat-initial', mode: 'review' };
    let reads = 0;
    const deps = {
        readActiveChatMode: () => {
            reads++;
            return activeChat;
        },
        saveActiveChatMode: async (chatId, mode) => ({ status: 'saved', chatId, mode }),
    };
    refreshOperationModeControl(panel, deps);
    assert.equal(reads, 1);

    activeChat = { status: 'ready', chatId: 'chat-fresh-origin', mode: 'review' };
    select.value = 'automatic';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.ok(reads >= 2);
});

test('17: requested same mode performs no save', async () => {
    const { panel, select } = createFakePanel();
    let saveCalled = false;
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: async () => {
            saveCalled = true;
            return { status: 'saved', chatId: 'c1', mode: 'review' };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'review';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(saveCalled, false);
});

test('18: same-mode no-op leaves selector enabled', async () => {
    const { panel, select } = createFakePanel();
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: async () => assert.fail('should not save'),
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'review';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(select.disabled, false);
    assert.equal(select.value, 'review');
});

test('19: save starts with selector disabled immediately', async () => {
    const { panel, select } = createFakePanel();
    const deferred = createDeferred();
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: () => deferred.promise,
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });

    assert.equal(select.disabled, true);
    deferred.resolve({ status: 'saved', chatId: 'c1', mode: 'off' });
    await delay();
});

test('20: save clears stale feedback', async () => {
    const { panel, select, feedback } = createFakePanel();
    feedback.textContent = 'Stale error';
    feedback.dataset.feedbackKind = 'error';
    feedback.hidden = false;

    const deferred = createDeferred();
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: () => deferred.promise,
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });

    assert.equal(feedback.textContent, '');
    assert.equal(feedback.dataset.feedbackKind, undefined);
    assert.equal(feedback.hidden, true);

    deferred.resolve({ status: 'saved', chatId: 'c1', mode: 'off' });
    await delay();
});

test('21: successful save calls saveActiveChatMode exactly once', async () => {
    const { panel, select } = createFakePanel();
    let calls = 0;
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: async (chatId, mode) => {
            calls++;
            return { status: 'saved', chatId, mode };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'automatic';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(calls, 1);
});

test('22: successful save passes fresh expected chatId', async () => {
    const { panel, select } = createFakePanel();
    let passedChatId = null;
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'expected-chat-id', mode: 'review' }),
        saveActiveChatMode: async (chatId, mode) => {
            passedChatId = chatId;
            return { status: 'saved', chatId, mode };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'automatic';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(passedChatId, 'expected-chat-id');
});

test('23: successful save passes selected canonical mode', async () => {
    const { panel, select } = createFakePanel();
    let passedMode = null;
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: async (chatId, mode) => {
            passedMode = mode;
            return { status: 'saved', chatId, mode };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(passedMode, 'off');
});

test('24: success re-reads mode after persistence', async () => {
    const { panel, select } = createFakePanel();
    let reads = 0;
    let activeMode = 'review';
    const deps = {
        readActiveChatMode: () => {
            reads++;
            return { status: 'ready', chatId: 'c1', mode: activeMode };
        },
        saveActiveChatMode: async (chatId, mode) => {
            activeMode = mode;
            return { status: 'saved', chatId, mode };
        },
    };
    refreshOperationModeControl(panel, deps);
    const initialReads = reads;

    select.value = 'automatic';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.ok(reads > initialReads);
});

test('25: same-chat success displays valid feedback', async () => {
    const { panel, select, feedback } = createFakePanel();
    let currentMode = 'review';
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: currentMode }),
        saveActiveChatMode: async (chatId, mode) => {
            currentMode = mode;
            return { status: 'saved', chatId, mode };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(feedback.dataset.feedbackKind, 'valid');
    assert.equal(feedback.hidden, false);
});

test('26: success text uses correct display label', async () => {
    const cases = [
        ['off', 'Off'],
        ['review', 'Review'],
        ['automatic', 'Automatic'],
    ];

    for (const [targetMode, expectedLabel] of cases) {
        const { panel, select, feedback } = createFakePanel();
        let currentMode = targetMode === 'review' ? 'off' : 'review';
        const deps = {
            readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: currentMode }),
            saveActiveChatMode: async (chatId, mode) => {
                currentMode = mode;
                return { status: 'saved', chatId, mode };
            },
        };
        refreshOperationModeControl(panel, deps);
        select.value = targetMode;
        select.dispatchEvent({ type: 'change' });
        await delay();

        assert.equal(
            feedback.textContent,
            `Operation mode saved: ${expectedLabel}.`,
        );
    }
});

test('27: success selector reflects fresh persisted mode', async () => {
    const { panel, select } = createFakePanel();
    let currentMode = 'review';
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: currentMode }),
        saveActiveChatMode: async (chatId, mode) => {
            currentMode = mode;
            return { status: 'saved', chatId, mode };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'automatic';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(select.value, 'automatic');
});

test('28: invalid-mode reverts to actual stored mode', async () => {
    const { panel, select } = createFakePanel();
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: async () => ({ status: 'invalid-mode' }),
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(select.value, 'review');
});

test('29: invalid-mode displays error', async () => {
    const { panel, select, feedback } = createFakePanel();
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: async () => ({ status: 'invalid-mode' }),
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(feedback.dataset.feedbackKind, 'error');
    assert.equal(feedback.textContent, 'The selected operation mode is invalid.');
    assert.equal(feedback.hidden, false);
});

test('30: invalid-state reverts to actual stored mode', async () => {
    const { panel, select } = createFakePanel();
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: async () => ({ status: 'invalid-state' }),
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'automatic';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(select.value, 'review');
});

test('31: invalid-state displays error', async () => {
    const { panel, select, feedback } = createFakePanel();
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: async () => ({ status: 'invalid-state' }),
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'automatic';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(feedback.dataset.feedbackKind, 'error');
    assert.equal(feedback.textContent, 'The operation mode could not be saved for this chat.');
    assert.equal(feedback.hidden, false);
});

test('32: no-chat result does not leak feedback', async () => {
    const { panel, select, feedback } = createFakePanel();
    let currentChat = { status: 'ready', chatId: 'c1', mode: 'review' };
    const deps = {
        readActiveChatMode: () => currentChat,
        saveActiveChatMode: async () => {
            currentChat = { status: 'no-chat', chatId: null, mode: null };
            return { status: 'no-chat' };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(feedback.textContent, '');
    assert.equal(feedback.hidden, true);
    assert.equal(select.value, 'review');
    assert.equal(select.disabled, true);
});

test('33: chat-changed result synchronizes new chat', async () => {
    const { panel, select } = createFakePanel();
    let currentChat = { status: 'ready', chatId: 'chat-1', mode: 'review' };
    const deps = {
        readActiveChatMode: () => currentChat,
        saveActiveChatMode: async () => {
            currentChat = { status: 'ready', chatId: 'chat-2', mode: 'automatic' };
            return { status: 'chat-changed', saved: true };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(select.value, 'automatic');
    assert.equal(select.disabled, false);
});

test('34: chat-changed result does not leak old success', async () => {
    const { panel, select, feedback } = createFakePanel();
    let currentChat = { status: 'ready', chatId: 'chat-1', mode: 'review' };
    const deps = {
        readActiveChatMode: () => currentChat,
        saveActiveChatMode: async () => {
            currentChat = { status: 'ready', chatId: 'chat-2', mode: 'automatic' };
            return { status: 'chat-changed', saved: true };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(feedback.textContent, '');
    assert.equal(feedback.hidden, true);
});

test('35: chat-changed saved:true does not attempt rollback', async () => {
    const { panel, select } = createFakePanel();
    let currentChat = { status: 'ready', chatId: 'chat-1', mode: 'review' };
    let saveCalls = 0;
    const deps = {
        readActiveChatMode: () => currentChat,
        saveActiveChatMode: async () => {
            saveCalls++;
            currentChat = { status: 'ready', chatId: 'chat-2', mode: 'automatic' };
            return { status: 'chat-changed', saved: true };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(saveCalls, 1);
});

test('36: thrown persistence error logs once', async () => {
    const { panel, select } = createFakePanel();
    const originalConsoleError = console.error;
    const errorLogs = [];
    console.error = (...args) => errorLogs.push(args);

    try {
        const deps = {
            readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
            saveActiveChatMode: async () => {
                throw new Error('Storage write failed');
            },
        };
        refreshOperationModeControl(panel, deps);
        select.value = 'off';
        select.dispatchEvent({ type: 'change' });
        await delay();

        assert.equal(errorLogs.length, 1);
        assert.match(String(errorLogs[0][0]), /Chromatic Dialogue/);
    } finally {
        console.error = originalConsoleError;
    }
});

test('37: thrown error on same chat reverts selector', async () => {
    const { panel, select } = createFakePanel();
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        const deps = {
            readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
            saveActiveChatMode: async () => {
                throw new Error('Storage write failed');
            },
        };
        refreshOperationModeControl(panel, deps);
        select.value = 'off';
        select.dispatchEvent({ type: 'change' });
        await delay();

        assert.equal(select.value, 'review');
    } finally {
        console.error = originalConsoleError;
    }
});

test('38: thrown error on same chat displays error', async () => {
    const { panel, select, feedback } = createFakePanel();
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        const deps = {
            readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
            saveActiveChatMode: async () => {
                throw new Error('Storage write failed');
            },
        };
        refreshOperationModeControl(panel, deps);
        select.value = 'off';
        select.dispatchEvent({ type: 'change' });
        await delay();

        assert.equal(feedback.dataset.feedbackKind, 'error');
        assert.equal(
            feedback.textContent,
            'The operation mode could not be saved. Check the browser console for details.',
        );
        assert.equal(feedback.hidden, false);
    } finally {
        console.error = originalConsoleError;
    }
});

test('39: thrown error after chat switch clears feedback', async () => {
    const { panel, select, feedback } = createFakePanel();
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        let currentChat = { status: 'ready', chatId: 'chat-1', mode: 'review' };
        const deps = {
            readActiveChatMode: () => currentChat,
            saveActiveChatMode: async () => {
                currentChat = { status: 'ready', chatId: 'chat-2', mode: 'automatic' };
                throw new Error('Storage write failed');
            },
        };
        refreshOperationModeControl(panel, deps);
        select.value = 'off';
        select.dispatchEvent({ type: 'change' });
        await delay();

        assert.equal(feedback.textContent, '');
        assert.equal(feedback.hidden, true);
        assert.equal(select.value, 'automatic');
        assert.equal(select.disabled, false);
    } finally {
        console.error = originalConsoleError;
    }
});

test('40: saving flag clears after success', async () => {
    const { panel, select } = createFakePanel();
    let currentMode = 'review';
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: currentMode }),
        saveActiveChatMode: async (chatId, mode) => {
            currentMode = mode;
            return { status: 'saved', chatId, mode };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(select.disabled, false);
});

test('41: saving flag clears after failure status', async () => {
    const { panel, select } = createFakePanel();
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: async () => ({ status: 'invalid-state' }),
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.equal(select.disabled, false);
});

test('42: saving flag clears after thrown exception', async () => {
    const { panel, select } = createFakePanel();
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        const deps = {
            readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
            saveActiveChatMode: async () => {
                throw new Error('Database exception');
            },
        };
        refreshOperationModeControl(panel, deps);
        select.value = 'off';
        select.dispatchEvent({ type: 'change' });
        await delay();

        assert.equal(select.disabled, false);
    } finally {
        console.error = originalConsoleError;
    }
});

test('43: duplicate change event while saving causes no second save', async () => {
    const { panel, select } = createFakePanel();
    const deferred = createDeferred();
    let saveCount = 0;
    const deps = {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'c1', mode: 'review' }),
        saveActiveChatMode: () => {
            saveCount++;
            return deferred.promise;
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    assert.equal(saveCount, 1);

    select.value = 'automatic';
    select.dispatchEvent({ type: 'change' });
    assert.equal(saveCount, 1);

    deferred.resolve({ status: 'saved', chatId: 'c1', mode: 'off' });
    await delay();
});

test('44: refresh during pending save fresh-reads current chat', async () => {
    const { panel, select } = createFakePanel();
    const deferred = createDeferred();
    let activeChat = { status: 'ready', chatId: 'chat-1', mode: 'review' };
    const deps = {
        readActiveChatMode: () => activeChat,
        saveActiveChatMode: () => deferred.promise,
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });

    activeChat = { status: 'ready', chatId: 'chat-2', mode: 'automatic' };
    refreshOperationModeControl(panel, deps);

    assert.equal(select.value, 'automatic');
    deferred.resolve({ status: 'saved', chatId: 'chat-1', mode: 'off' });
    await delay();
});

test('45: refresh during pending save keeps selector disabled', async () => {
    const { panel, select } = createFakePanel();
    const deferred = createDeferred();
    let activeChat = { status: 'ready', chatId: 'chat-1', mode: 'review' };
    const deps = {
        readActiveChatMode: () => activeChat,
        saveActiveChatMode: () => deferred.promise,
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });

    activeChat = { status: 'ready', chatId: 'chat-2', mode: 'automatic' };
    refreshOperationModeControl(panel, deps);

    assert.equal(select.disabled, true);
    deferred.resolve({ status: 'saved', chatId: 'chat-1', mode: 'off' });
    await delay();
});

test('46: old operation settling after chat switch converges to new chat mode', async () => {
    const { panel, select, feedback } = createFakePanel();
    const deferred = createDeferred();
    let activeChat = { status: 'ready', chatId: 'chat-1', mode: 'review' };
    const deps = {
        readActiveChatMode: () => activeChat,
        saveActiveChatMode: () => deferred.promise,
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    select.dispatchEvent({ type: 'change' });

    activeChat = { status: 'ready', chatId: 'chat-2', mode: 'automatic' };
    refreshOperationModeControl(panel, deps);

    deferred.resolve({ status: 'saved', chatId: 'chat-1', mode: 'off' });
    await delay();

    assert.equal(select.disabled, false);
    assert.equal(select.value, 'automatic');
    assert.equal(feedback.textContent, '');
    assert.equal(feedback.hidden, true);
});

test('47: feedback uses textContent, never innerHTML', async () => {
    const { panel, select, feedback } = createFakePanel();
    let persistedMode = 'review';
    const deps = {
        readActiveChatMode: () => ({
            status: 'ready',
            chatId: 'c1',
            mode: persistedMode,
        }),
        saveActiveChatMode: async (chatId, mode) => {
            persistedMode = mode;
            return {
                status: 'saved',
                chatId,
                mode,
            };
        },
    };
    refreshOperationModeControl(panel, deps);
    select.value = 'off';
    assert.doesNotThrow(() => {
        select.dispatchEvent({ type: 'change' });
    });
    await delay();

    assert.equal(feedback.textContent, 'Operation mode saved: Off.');
});

test('48: no direct SillyTavern metadata access in mode-panel.js', () => {
    const source = readFileSync(
        new URL('../src/mode-panel.js', import.meta.url),
        'utf8',
    );
    assert.doesNotMatch(source, /\bchatMetadata\b/);
    assert.doesNotMatch(source, /\bgetContext\b/);
    assert.doesNotMatch(source, /\bSillyTavern\b/);
});

test('49: no pending-review imports in mode-panel.js', () => {
    const source = readFileSync(
        new URL('../src/mode-panel.js', import.meta.url),
        'utf8',
    );
    assert.doesNotMatch(source, /\bpending-review\b/);
});

test('50: no registration-service imports in mode-panel.js', () => {
    const source = readFileSync(
        new URL('../src/mode-panel.js', import.meta.url),
        'utf8',
    );
    assert.doesNotMatch(source, /\bregistration-service\b/);
});

test('51: no message-runtime imports in mode-panel.js', () => {
    const source = readFileSync(
        new URL('../src/mode-panel.js', import.meta.url),
        'utf8',
    );
    assert.doesNotMatch(source, /\bmessage-runtime\b/);
});

test('52: no panel.js import in mode-panel.js', () => {
    const source = readFileSync(
        new URL('../src/mode-panel.js', import.meta.url),
        'utf8',
    );
    assert.doesNotMatch(source, /\bpanel\.js\b/);
});

test('53: no dialogue-style refresh in mode-panel.js', () => {
    const source = readFileSync(
        new URL('../src/mode-panel.js', import.meta.url),
        'utf8',
    );
    assert.doesNotMatch(source, /\b(?:refreshDialogueStyles|refreshStyles|generateStyles)\b/);
});

test('54: module import causes no side effects', async () => {
    const mod = await import('../src/mode-panel.js');
    assert.equal(typeof mod.refreshOperationModeControl, 'function');
    assert.deepEqual(Object.keys(mod), ['refreshOperationModeControl']);
});

test('55: accepts ready state with falsy-but-present empty-string chat ID', async () => {
    const { panel, select, feedback } = createFakePanel();
    const calls = [];
    let persistedMode = 'review';
    const deps = {
        readActiveChatMode: () => ({
            status: 'ready',
            chatId: '',
            mode: persistedMode,
        }),
        saveActiveChatMode: async (chatId, mode) => {
            calls.push([chatId, mode]);
            persistedMode = mode;
            return {
                status: 'saved',
                chatId,
                mode,
            };
        },
    };

    refreshOperationModeControl(panel, deps);
    assert.equal(select.disabled, false);

    select.value = 'off';
    select.dispatchEvent({ type: 'change' });
    await delay();

    assert.deepEqual(calls, [['', 'off']]);
    assert.equal(persistedMode, 'off');
    assert.equal(select.value, 'off');
    assert.equal(select.disabled, false);
    assert.equal(feedback.dataset.feedbackKind, 'valid');
    assert.equal(feedback.hidden, false);
    assert.equal(feedback.textContent, 'Operation mode saved: Off.');
});