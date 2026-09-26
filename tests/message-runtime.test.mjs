import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    CHAT_METADATA_KEY,
    CHAT_MODE_METADATA_KEY,
    OPERATION_MODE_OFF,
    OPERATION_MODE_REVIEW,
    OPERATION_MODE_AUTOMATIC,
} from '../src/constants.js';
import {
    getPendingReview,
    getPendingReviewCount,
    clearAllPendingReviews,
    subscribePendingReviewChanges,
} from '../src/pending-review-store.js';

let importCounter = 0;
async function loadFreshRuntime() {
    importCounter += 1;
    return await import(`../src/message-runtime.js?test=${importCounter}`);
}

async function waitFor(predicate, { timeoutMs = 2000, intervalMs = 10 } = {}) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        if (await predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('waitFor timed out');
}

const settleQueue = async () => new Promise((resolve) => setTimeout(resolve, 50));

function setupMockDom({ backgroundColor = 'rgb(24, 24, 24)' } = {}) {
    const mesText = {
        parentElement: null,
        style: { backgroundColor },
    };
    globalThis.document = {
        querySelector(selector) {
            if (selector === '#chat .mes_text' || selector === '#chat') {
                return mesText;
            }
            return null;
        },
    };
    globalThis.getComputedStyle = (el) => ({
        backgroundColor: el?.style?.backgroundColor || 'rgba(0, 0, 0, 0)',
    });
    return mesText;
}

function setupContextWithChat({
    chatId = 'chat-1',
    chat = [],
    chatMetadata = {},
    backgroundColor = 'rgb(24, 24, 24)',
    setupDom = true,
} = {}) {
    if (setupDom) {
        setupMockDom({ backgroundColor });
    }

    let handler = null;
    const context = {
        chatId,
        chat,
        chatMetadata,
        event_types: { MESSAGE_RECEIVED: 'message_received' },
        eventSource: {
            on(event, fn) {
                handler = fn;
            },
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return context;
        },
    };

    return {
        context,
        getHandler: () => handler,
    };
}

beforeEach(() => {
    clearAllPendingReviews();
});

afterEach(async () => {
    delete globalThis.SillyTavern;
    delete globalThis.document;
    delete globalThis.getComputedStyle;
    clearAllPendingReviews();
    await new Promise((resolve) => setTimeout(resolve, 20));
});

test('1. Missing SillyTavern -> unavailable', async () => {
    delete globalThis.SillyTavern;
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'unavailable',
    });
});

test('2. Official event_types registration works', async () => {
    let registeredEvent = null;
    let registeredHandler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                event_types: { MESSAGE_RECEIVED: 'official_event' },
                eventSource: {
                    on(event, handler) {
                        registeredEvent = event;
                        registeredHandler = handler;
                    },
                },
            };
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    const result = registerMessageReceivedRuntime();
    assert.deepEqual(result, { status: 'registered' });
    assert.strictEqual(registeredEvent, 'official_event');
    assert.strictEqual(typeof registeredHandler, 'function');
});

test('3. eventTypes fallback works', async () => {
    let registeredEvent = null;
    let registeredHandler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                eventTypes: { MESSAGE_RECEIVED: 'fallback_event' },
                eventSource: {
                    on(event, handler) {
                        registeredEvent = event;
                        registeredHandler = handler;
                    },
                },
            };
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    const result = registerMessageReceivedRuntime();
    assert.deepEqual(result, { status: 'registered' });
    assert.strictEqual(registeredEvent, 'fallback_event');
    assert.strictEqual(typeof registeredHandler, 'function');
});

test('4. event_types remains preferred', async () => {
    let registeredEvent = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                event_types: { MESSAGE_RECEIVED: 'official_priority' },
                eventTypes: { MESSAGE_RECEIVED: 'fallback_priority' },
                eventSource: {
                    on(event) {
                        registeredEvent = event;
                    },
                },
            };
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    const result = registerMessageReceivedRuntime();
    assert.deepEqual(result, { status: 'registered' });
    assert.strictEqual(registeredEvent, 'official_priority');
});

test('5. Idempotent registration remains intact', async () => {
    let listenerCount = 0;
    globalThis.SillyTavern = {
        getContext() {
            return {
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on() {
                        listenerCount += 1;
                    },
                },
            };
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    const res1 = registerMessageReceivedRuntime();
    assert.deepEqual(res1, { status: 'registered' });

    const res2 = registerMessageReceivedRuntime();
    assert.deepEqual(res2, { status: 'already-registered' });

    assert.strictEqual(listenerCount, 1);
});

test('6. Failed registration may retry', async () => {
    let available = false;
    globalThis.SillyTavern = {
        getContext() {
            if (!available) {
                return null;
            }
            return {
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: { on() {} },
            };
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'unavailable',
    });

    available = true;
    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'registered',
    });
});

test('7. eventSource.on failure may retry', async () => {
    let shouldThrow = true;
    globalThis.SillyTavern = {
        getContext() {
            return {
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on() {
                        if (shouldThrow) {
                            throw new Error('Subscription failure');
                        }
                    },
                },
            };
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'unavailable',
    });

    shouldThrow = false;
    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'registered',
    });
});

test('8. Registration itself does NOT resolve runtime options', async () => {
    let querySelectorCalls = 0;
    let getComputedStyleCalls = 0;

    globalThis.document = {
        querySelector() {
            querySelectorCalls += 1;
            return null;
        },
    };
    globalThis.getComputedStyle = () => {
        getComputedStyleCalls += 1;
        return { backgroundColor: 'rgb(0, 0, 0)' };
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: { on() {} },
            };
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    const result = registerMessageReceivedRuntime();

    assert.deepEqual(result, { status: 'registered' });
    assert.strictEqual(querySelectorCalls, 0);
    assert.strictEqual(getComputedStyleCalls, 0);
});

test('9. First MESSAGE_RECEIVED invokes resolveRuntimeOptions', async () => {
    let querySelectorCalls = 0;
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(24, 24, 24)' },
    };

    globalThis.document = {
        querySelector(selector) {
            querySelectorCalls += 1;
            if (selector === '#chat .mes_text' || selector === '#chat') {
                return mesText;
            }
            return null;
        },
    };
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(24, 24, 24)' });

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    assert.strictEqual(querySelectorCalls, 0);
    getHandler()(0);
    assert.ok(querySelectorCalls > 0);
});

test('10. Every event invokes resolver exactly once', async () => {
    let resolverQueries = 0;
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(24, 24, 24)' },
    };

    globalThis.document = {
        querySelector(selector) {
            if (selector === '#chat .mes_text') {
                resolverQueries += 1;
                return mesText;
            }
            return null;
        },
    };
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(24, 24, 24)' });

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    assert.strictEqual(resolverQueries, 0);

    getHandler()(0);
    assert.strictEqual(resolverQueries, 1);

    getHandler()(0);
    assert.strictEqual(resolverQueries, 2);

    getHandler()(0);
    assert.strictEqual(resolverQueries, 3);
});

test('11. Resolver ready result is passed to inspector', async () => {
    const rawMessage = '[c1]Speaking.[/c]\n<!-- CD_NEW {"id":"c1","name":"Mara","color":"#e0e0e0"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        backgroundColor: 'rgb(255, 255, 255)',
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    const review = getPendingReview('chat-1', 0);
    assert.ok(review);
    assert.strictEqual(review.proposals[0].colorAdjusted, true);
    assert.notStrictEqual(review.proposals[0].color, '#E0E0E0');
});

test('12. Resolver unavailable stores nothing', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    delete globalThis.document;

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);
    assert.strictEqual(getPendingReviewCount(), 0);
});

test('13. Resolver unavailable prevents inspector execution', async () => {
    delete globalThis.document;
    let contextCallsAfterRegistration = 0;

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            contextCallsAfterRegistration += 1;
            return {
                chatId: 'chat-1',
                chat: [{ mes: '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->', is_user: false }],
                chatMetadata: {},
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
            };
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    const baselineCalls = contextCallsAfterRegistration;
    handler(0);

    assert.strictEqual(
        contextCallsAfterRegistration,
        baselineCalls + 1,
    );
    assert.strictEqual(getPendingReviewCount(), 0);
});

test('14. Later event retries resolver after prior unavailable result', async () => {
    delete globalThis.document;
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);
    assert.strictEqual(getPendingReviewCount(), 0);

    setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });
    getHandler()(0);
    assert.strictEqual(getPendingReviewCount(), 1);
});

test('15. Resolver exception does not escape handler', async () => {
    globalThis.document = {
        querySelector() {
            throw new Error('DOM query exploded');
        },
    };
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(0, 0, 0)' });

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    assert.doesNotThrow(() => {
        getHandler()(0);
    });
    assert.strictEqual(getPendingReviewCount(), 0);
});

test('16. Inspector exception does not escape handler', async () => {
    let callCount = 0;
    let handler = null;
    setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            if (callCount === 1) {
                return {
                    event_types: { MESSAGE_RECEIVED: 'message_received' },
                    eventSource: {
                        on(event, fn) {
                            handler = fn;
                        },
                    },
                };
            }
            throw new Error('SillyTavern internal crash during inspection');
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    assert.doesNotThrow(() => {
        handler(0);
    });
    assert.strictEqual(getPendingReviewCount(), 0);
});

test('17. Store exception does not escape handler', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    const originalMapSet = Map.prototype.set;
    try {
        Map.prototype.set = () => {
            throw new Error('Map store crash');
        };
        assert.doesNotThrow(() => {
            getHandler()(0);
        });
    } finally {
        Map.prototype.set = originalMapSet;
    }
    assert.strictEqual(getPendingReviewCount(), 0);
});

test('18. Ready inspection creates pending review', async () => {
    const rawMessage = '[c1]Hello world.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-abc',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount('chat-abc'), 1);
    const review = getPendingReview('chat-abc', 0);
    assert.strictEqual(review.chatId, 'chat-abc');
    assert.strictEqual(review.messageId, 0);
    assert.strictEqual(review.proposals[0].name, 'Alice');
});

test('19. no-proposals stores nothing', async () => {
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: 'Ordinary text without trailer.', is_user: false }],
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('20. rejected stores nothing', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW not-valid-json -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('21. ignored stores nothing', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: true }],
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('22. unsupported-schema stores nothing', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 99,
                assignments: {},
            },
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('23. chat-changed stores nothing', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    let handler = null;
    let callCount = 0;

    setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    const chatAContext = {
        chatId: 'chat-a',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {},
    };

    const chatBContext = {
        chatId: 'chat-b',
        chat: [],
        chatMetadata: {},
    };

    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            if (callCount === 1) {
                return {
                    event_types: { MESSAGE_RECEIVED: 'message_received' },
                    eventSource: {
                        on(event, fn) {
                            handler = fn;
                        },
                    },
                };
            }
            return callCount === 2 ? chatAContext : chatBContext;
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('24. Duplicate same-key event still uses A10b upsert', async () => {
    const chat = [
        {
            mes: '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
            is_user: false,
        },
    ];
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    const handler = getHandler();
    handler(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');

    chat[0] = {
        mes: '[c1]Updated.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->',
        is_user: false,
    };

    handler(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Bob');
});

test('25. Different chats remain independent', async () => {
    setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    let currentChatId = 'chat-a';
    const chatA = [
        {
            mes: '[c1]Hello A.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
            is_user: false,
        },
    ];
    const chatB = [
        {
            mes: '[c1]Hello B.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->',
            is_user: false,
        },
    ];

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: currentChatId,
                chat: currentChatId === 'chat-a' ? chatA : chatB,
                chatMetadata: {},
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
            };
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);
    assert.strictEqual(getPendingReviewCount('chat-a'), 1);

    currentChatId = 'chat-b';
    handler(0);

    assert.strictEqual(getPendingReviewCount('chat-a'), 1);
    assert.strictEqual(getPendingReviewCount('chat-b'), 1);
    assert.strictEqual(getPendingReviewCount(), 2);
    assert.strictEqual(getPendingReview('chat-a', 0).proposals[0].name, 'Alice');
    assert.strictEqual(getPendingReview('chat-b', 0).proposals[0].name, 'Bob');
});

test('26. No metadata persistence occurs', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {};
    let saveMetadataCalled = false;

    setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveMetadataCalled = true;
                },
            };
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    assert.strictEqual(saveMetadataCalled, false);
    assert.deepEqual(metadata, {});
});

test('27. Raw message remains unchanged', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const messageObj = Object.freeze({
        mes: rawMessage,
        is_user: false,
    });
    const chat = Object.freeze([messageObj]);

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(messageObj.mes, rawMessage);
    assert.strictEqual(chat[0], messageObj);
});

test('28. CD_NEW remains unchanged', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler, context } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.ok(context.chat[0].mes.includes('<!-- CD_NEW'));
});

test('29. No automatic character registration occurs', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: metadata,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.deepEqual(metadata[CHAT_METADATA_KEY].assignments, {});
});

test('30. Registration function is synchronous', async () => {
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [],
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    const result = registerMessageReceivedRuntime();

    assert.strictEqual(result instanceof Promise, false);
    assert.strictEqual(typeof result?.then, 'undefined');
    assert.deepEqual(result, { status: 'registered' });
});

test('31. Event handler may execute synchronously', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    const result = getHandler()(0);
    assert.strictEqual(result instanceof Promise, false);
    assert.strictEqual(typeof result?.then, 'undefined');
});

test('32. No hard-coded fallback background exists', async () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'transparent' },
    };
    globalThis.document = {
        querySelector(selector) {
            if (selector === '#chat .mes_text' || selector === '#chat') {
                return mesText;
            }
            return null;
        },
    };
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgba(0, 0, 0, 0)' });

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);
    assert.strictEqual(getPendingReviewCount(), 0);
});

test('33. Runtime does not cache resolved options', async () => {
    const mesText = setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    const rawMessage = '[c1]Speaking.[/c]\n<!-- CD_NEW {"id":"c1","name":"Mara","color":"#e0e0e0"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);
    const review1 = getPendingReview('chat-1', 0);
    assert.strictEqual(review1.proposals[0].colorAdjusted, false);
    assert.strictEqual(review1.proposals[0].color, '#E0E0E0');

    mesText.style.backgroundColor = 'rgb(255, 255, 255)';

    getHandler()(0);
    const review2 = getPendingReview('chat-1', 0);
    assert.strictEqual(review2.proposals[0].colorAdjusted, true);
    assert.notStrictEqual(review2.proposals[0].color, '#E0E0E0');
});

test('34. Theme changes between events are observed', async () => {
    const mesText = setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    const chat = [
        {
            mes: '[c1]Speaking 1.[/c]\n<!-- CD_NEW {"id":"c1","name":"Mara","color":"#e0e0e0"} -->',
            is_user: false,
        },
        {
            mes: '[c1]Speaking 2.[/c]\n<!-- CD_NEW {"id":"c1","name":"Mara2","color":"#e0e0e0"} -->',
            is_user: false,
        },
    ];

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].colorAdjusted, false);

    mesText.style.backgroundColor = 'rgb(255, 255, 255)';

    getHandler()(1);
    assert.strictEqual(getPendingReview('chat-1', 1).proposals[0].colorAdjusted, true);
});

test('35. Dark-background first event and light-background second event produce results using their respective current backgrounds', async () => {
    const mesText = setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    const chat = [
        {
            mes: '[c1]First.[/c]\n<!-- CD_NEW {"id":"c1","name":"Mara","color":"#e0e0e0"} -->',
            is_user: false,
        },
        {
            mes: '[c1]Second.[/c]\n<!-- CD_NEW {"id":"c1","name":"Mara","color":"#e0e0e0"} -->',
            is_user: false,
        },
    ];

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);
    const firstReview = getPendingReview('chat-1', 0);
    assert.strictEqual(firstReview.proposals[0].colorAdjusted, false);
    assert.strictEqual(firstReview.proposals[0].color, '#E0E0E0');

    mesText.style.backgroundColor = 'rgb(255, 255, 255)';

    getHandler()(1);
    const secondReview = getPendingReview('chat-1', 1);
    assert.strictEqual(secondReview.proposals[0].colorAdjusted, true);
    assert.notStrictEqual(secondReview.proposals[0].color, '#E0E0E0');
});

test('36. Invalid/unresolvable DOM for one event does not disable runtime', async () => {
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'transparent' },
    };
    globalThis.document = {
        querySelector(selector) {
            if (selector === '#chat .mes_text' || selector === '#chat') {
                return mesText;
            }
            return null;
        },
    };
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgba(0, 0, 0, 0)' });

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);
    assert.strictEqual(getPendingReviewCount(), 0);

    mesText.style.backgroundColor = 'rgb(24, 24, 24)';
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(24, 24, 24)' });

    getHandler()(0);
    assert.strictEqual(getPendingReviewCount(), 1);
});

test('37. Subsequent resolvable event works normally', async () => {
    delete globalThis.document;

    const chat = [
        {
            mes: '[c1]First.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
            is_user: false,
        },
        {
            mes: '[c1]Second.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->',
            is_user: false,
        },
    ];

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);
    assert.strictEqual(getPendingReviewCount(), 0);

    setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    getHandler()(1);
    assert.strictEqual(getPendingReviewCount(), 1);
    assert.strictEqual(getPendingReview('chat-1', 1).proposals[0].name, 'Bob');
});

test('38. messageId is passed unchanged into inspector path', async () => {
    const rawMessage = '[c1]Hello world.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const chat = [];
    chat[5] = { mes: rawMessage, is_user: false };

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(5);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 5).messageId, 5);

    getHandler()('5');
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 5).messageId, 5);
});

test('39. Runtime resolves options before inspection', async () => {
    const callOrder = [];

    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(24, 24, 24)' },
    };

    globalThis.document = {
        querySelector(selector) {
            callOrder.push('dom_query');
            if (selector === '#chat .mes_text' || selector === '#chat') {
                return mesText;
            }
            return null;
        },
    };
    globalThis.getComputedStyle = () => {
        callOrder.push('computed_style');
        return { backgroundColor: 'rgb(24, 24, 24)' };
    };

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    let handler = null;
    let registeredOnce = false;

    globalThis.SillyTavern = {
        getContext() {
            if (!registeredOnce) {
                registeredOnce = true;
                return {
                    event_types: { MESSAGE_RECEIVED: 'message_received' },
                    eventSource: {
                        on(event, fn) {
                            handler = fn;
                        },
                    },
                };
            }
            callOrder.push('sillytavern_context');
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    callOrder.length = 0;
    handler(0);

    assert.ok(callOrder.indexOf('dom_query') !== -1);
    assert.ok(callOrder.indexOf('sillytavern_context') !== -1);
    assert.ok(
        callOrder.indexOf('sillytavern_context') <
        callOrder.indexOf('dom_query'),
    );
    assert.ok(
        callOrder.lastIndexOf('sillytavern_context') >
        callOrder.indexOf('dom_query'),
    );
});

test('40. Resolver is not called when no event has fired', async () => {
    let querySelectorCalls = 0;
    globalThis.document = {
        querySelector() {
            querySelectorCalls += 1;
            return null;
        },
    };
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(0, 0, 0)' });

    setupContextWithChat({
        chatId: 'chat-1',
        chat: [],
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    assert.strictEqual(querySelectorCalls, 0);
});

test('41. Missing getContext -> unavailable', async () => {
    globalThis.SillyTavern = {};
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'unavailable',
    });
});

test('42. Throwing getContext -> unavailable', async () => {
    globalThis.SillyTavern = {
        getContext() {
            throw new Error('boom');
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'unavailable',
    });
});

test('43. Missing context -> unavailable', async () => {
    globalThis.SillyTavern = {
        getContext() {
            return null;
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'unavailable',
    });
});

test('44. Missing eventSource -> unavailable', async () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                event_types: {
                    MESSAGE_RECEIVED: 'message_received',
                },
            };
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'unavailable',
    });
});

test('45. Missing eventSource.on -> unavailable', async () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                event_types: {
                    MESSAGE_RECEIVED: 'message_received',
                },
                eventSource: {},
            };
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'unavailable',
    });
});

test('46. Missing both event constant aliases -> unavailable', async () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                event_types: {},
                eventTypes: {},
                eventSource: {
                    on() {},
                },
            };
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'unavailable',
    });
});

test('47. Registry rejection stores nothing', async () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: {
                        name: 'ExistingAlice',
                        color: '#111111',
                    },
                },
            },
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('48. Missing message stores nothing', async () => {
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [],
        chatMetadata: {},
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('49. Invalid store result does not throw', async () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');
    const { getHandler } = setupContextWithChat({
        chatId: ' padded-chat-id ',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {},
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    assert.doesNotThrow(() => {
        getHandler()(0);
    });
    assert.strictEqual(getPendingReviewCount(), 0);
});

test('50. Empty MESSAGE_RECEIVED identifier -> unavailable', async () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                event_types: {
                    MESSAGE_RECEIVED: '',
                },
                eventTypes: {
                    MESSAGE_RECEIVED: '',
                },
                eventSource: {
                    on() {
                        assert.fail('must not subscribe');
                    },
                },
            };
        },
    };
    const { registerMessageReceivedRuntime } = await loadFreshRuntime();

    assert.deepEqual(registerMessageReceivedRuntime(), {
        status: 'unavailable',
    });
});

test('51. Registration does not call readActiveChatMode or inspect mode', async () => {
    let modeAccessed = false;
    const context = {
        chatId: 'chat-1',
        chat: [],
        get chatMetadata() {
            modeAccessed = true;
            return {};
        },
        event_types: { MESSAGE_RECEIVED: 'message_received' },
        eventSource: { on() {} },
    };
    globalThis.SillyTavern = {
        getContext() {
            return context;
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    const result = registerMessageReceivedRuntime();

    assert.deepEqual(result, { status: 'registered' });
    assert.strictEqual(modeAccessed, false);
});

test('52. Every MESSAGE_RECEIVED event performs a fresh mode read', async () => {
    let metadataReadCount = 0;
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';

    const metadata = {};
    const context = {
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        get chatMetadata() {
            metadataReadCount += 1;
            return metadata;
        },
        event_types: { MESSAGE_RECEIVED: 'message_received' },
        eventSource: {
            on(event, fn) {
                handler = fn;
            },
        },
    };
    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return context;
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    assert.strictEqual(metadataReadCount, 0);

    handler(0);
    const readCount1 = metadataReadCount;
    assert.ok(readCount1 > 0);

    handler(0);
    const readCount2 = metadataReadCount;
    assert.ok(readCount2 > readCount1);

    handler(0);
    const readCount3 = metadataReadCount;
    assert.ok(readCount3 > readCount2);
});

test('53. Non-ready mode result stops processing', async () => {
    let querySelectorCalls = 0;
    globalThis.document = {
        querySelector() {
            querySelectorCalls += 1;
            return null;
        },
    };
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(24, 24, 24)' });

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: null,
        chat: [{ mes: rawMessage, is_user: false }],
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(querySelectorCalls, 0);
    assert.strictEqual(getPendingReviewCount(), 0);
});

test('54. no-chat mode result stores nothing', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: '',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('55. Off stores nothing', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_OFF,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('56. Off does not resolve runtime options', async () => {
    let querySelectorCalls = 0;
    globalThis.document = {
        querySelector() {
            querySelectorCalls += 1;
            return null;
        },
    };
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(24, 24, 24)' });

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_OFF,
        },
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(querySelectorCalls, 0);
});

test('57. Off does not inspect message / access chat through inspector', async () => {
    let messageTextAccessed = false;
    const messageObj = {
        get mes() {
            messageTextAccessed = true;
            return '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
        },
        is_user: false,
    };

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [messageObj],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_OFF,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(messageTextAccessed, false);
});

test('58. Off does not query DOM/background color', async () => {
    let querySelectorCalled = false;
    let getComputedStyleCalled = false;

    globalThis.document = {
        querySelector() {
            querySelectorCalled = true;
            return null;
        },
    };
    globalThis.getComputedStyle = () => {
        getComputedStyleCalled = true;
        return { backgroundColor: 'rgb(24, 24, 24)' };
    };

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_OFF,
        },
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(querySelectorCalled, false);
    assert.strictEqual(getComputedStyleCalled, false);
});

test('59. Off does not mutate pending reviews already present and leaves them available', async () => {
    const rawMessage1 = '[c1]Hello 1.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const rawMessage2 = '[c2]Hello 2.[/c]\n<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->';
    const chat = [
        { mes: rawMessage1, is_user: false },
        { mes: rawMessage2, is_user: false },
    ];
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
    };

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
        chatMetadata: metadata,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_OFF;

    getHandler()(1);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    const existingReview = getPendingReview('chat-1', 0);
    assert.ok(existingReview);
    assert.strictEqual(existingReview.proposals[0].name, 'Alice');
});

test('60. Review preserves existing pending-review behavior', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    const review = getPendingReview('chat-1', 0);
    assert.strictEqual(review.messageId, 0);
    assert.strictEqual(review.proposals[0].name, 'Alice');
});

test('61. Review ready proposal stores exactly one review record', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
});

test('62. Review multiple proposals remain one atomic review record', async () => {
    const rawMessage = [
        '[c1]Hello.[/c] [c2]Greetings.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->',
    ].join('\n');

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    const review = getPendingReview('chat-1', 0);
    assert.strictEqual(review.proposals.length, 2);
    assert.strictEqual(review.proposals[0].name, 'Alice');
    assert.strictEqual(review.proposals[1].name, 'Bob');
});

test('63. Automatic routes through enqueueAutomaticReview creating pending review immediately', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    const review = getPendingReview('chat-1', 0);
    assert.strictEqual(review.messageId, 0);
    assert.strictEqual(review.proposals[0].name, 'Alice');
    await settleQueue();
});

test('64. Automatic persists assignment and calls saveMetadata asynchronously', async () => {
    let saveMetadataCalled = false;
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveMetadataCalled = true;
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    assert.strictEqual(saveMetadataCalled, false);

    await waitFor(() => saveMetadataCalled === true);

    assert.strictEqual(saveMetadataCalled, true);
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Alice');
});

test('65. Automatic removes pending review automatically upon approval', async () => {
    let saveMetadataCalled = false;
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveMetadataCalled = true;
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);

    await waitFor(() => getPendingReviewCount('chat-1') === 0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 0);
    assert.strictEqual(getPendingReview('chat-1', 0), null);
});

test('66. Switching Review -> Off affects the next event immediately', async () => {
    const rawMessage1 = '[c1]Msg 1.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const rawMessage2 = '[c2]Msg 2.[/c]\n<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->';
    const chat = [
        { mes: rawMessage1, is_user: false },
        { mes: rawMessage2, is_user: false },
    ];
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
    };

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
        chatMetadata: metadata,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    const handler = getHandler();
    handler(0);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_OFF;

    handler(1);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
});

test('67. Switching Off -> Review affects the next event immediately', async () => {
    const rawMessage1 = '[c1]Msg 1.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const rawMessage2 = '[c1]Msg 2.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->';
    const chat = [
        { mes: rawMessage1, is_user: false },
        { mes: rawMessage2, is_user: false },
    ];
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_OFF,
    };

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
        chatMetadata: metadata,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    const handler = getHandler();
    handler(0);
    assert.strictEqual(getPendingReviewCount('chat-1'), 0);

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_REVIEW;

    handler(1);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 1).proposals[0].name, 'Bob');
});

test('68. Switching Review -> Automatic affects the next event immediately without re-registration', async () => {
    const rawMessage1 = '[c1]Msg 1.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const rawMessage2 = '[c1]Msg 2.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->';
    const chat = [
        { mes: rawMessage1, is_user: false },
        { mes: rawMessage2, is_user: false },
    ];
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
    };

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
        chatMetadata: metadata,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    const handler = getHandler();
    handler(0);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_AUTOMATIC;

    handler(1);
    assert.strictEqual(getPendingReviewCount('chat-1'), 2);
    assert.strictEqual(getPendingReview('chat-1', 1).proposals[0].name, 'Bob');
    await settleQueue();
});

test('69. Unknown ready mode fails safely to Review behavior', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: 'future_unknown_mode',
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');
});

test('70. Malformed stored mode falls back through mode-store to Review', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: 12345,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');
});

test('71. Mode read occurs before runtime-option resolution', async () => {
    const callOrder = [];
    const mesText = {
        parentElement: null,
        style: { backgroundColor: 'rgb(24, 24, 24)' },
    };

    globalThis.document = {
        querySelector(selector) {
            callOrder.push('dom_query');
            if (selector === '#chat .mes_text' || selector === '#chat') {
                return mesText;
            }
            return null;
        },
    };
    globalThis.getComputedStyle = () => {
        callOrder.push('computed_style');
        return { backgroundColor: 'rgb(24, 24, 24)' };
    };

    let registeredOnce = false;
    let handler = null;
    const metadata = {
        get [CHAT_MODE_METADATA_KEY]() {
            callOrder.push('mode_metadata_read');
            return OPERATION_MODE_REVIEW;
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            if (!registeredOnce) {
                registeredOnce = true;
                return {
                    event_types: { MESSAGE_RECEIVED: 'message_received' },
                    eventSource: {
                        on(event, fn) {
                            handler = fn;
                        },
                    },
                };
            }
            return {
                chatId: 'chat-1',
                chat: [{ mes: '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->', is_user: false }],
                chatMetadata: metadata,
            };
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    callOrder.length = 0;
    handler(0);

    assert.ok(callOrder.indexOf('mode_metadata_read') !== -1);
    assert.ok(callOrder.indexOf('dom_query') !== -1);
    assert.ok(callOrder.indexOf('mode_metadata_read') < callOrder.indexOf('dom_query'));
});

test('72. Mode read exception does not escape handler and stores nothing', async () => {
    let callCount = 0;
    let handler = null;

    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            if (callCount === 1) {
                return {
                    event_types: { MESSAGE_RECEIVED: 'message_received' },
                    eventSource: {
                        on(event, fn) {
                            handler = fn;
                        },
                    },
                };
            }
            throw new Error('Explosion during readActiveChatMode');
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    assert.doesNotThrow(() => {
        handler(0);
    });
    assert.strictEqual(getPendingReviewCount(), 0);
});

test('73. Inspector/mode chat ID mismatch stores nothing', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    let handler = null;
    let callCount = 0;

    setupMockDom();

    const modeReadContext = {
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        },
    };

    const inspectorChatContext = {
        chatId: 'chat-2',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            if (callCount === 1) {
                return {
                    event_types: { MESSAGE_RECEIVED: 'message_received' },
                    eventSource: {
                        on(event, fn) {
                            handler = fn;
                        },
                    },
                };
            }
            if (callCount === 2) {
                return modeReadContext;
            }
            return inspectorChatContext;
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('74. Race mismatch does not remove unrelated pending reviews or persist metadata', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    let handler = null;
    let callCount = 0;
    let saveMetadataCalled = false;

    setupMockDom();

    const stableContext = {
        chatId: 'chat-stable',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        },
        event_types: { MESSAGE_RECEIVED: 'message_received' },
        eventSource: {
            on(event, fn) {
                handler = fn;
            },
        },
        saveMetadata() {
            saveMetadataCalled = true;
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            return stableContext;
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);
    assert.strictEqual(getPendingReviewCount('chat-stable'), 1);

    const raceModeContext = {
        chatId: 'chat-racing-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        },
        saveMetadata() {
            saveMetadataCalled = true;
        },
    };

    const raceInspectorContext = {
        chatId: 'chat-racing-2',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        },
        saveMetadata() {
            saveMetadataCalled = true;
        },
    };

    let racingCalls = 0;
    globalThis.SillyTavern.getContext = () => {
        racingCalls += 1;
        return racingCalls === 1 ? raceModeContext : raceInspectorContext;
    };

    handler(0);

    assert.strictEqual(saveMetadataCalled, false);
    assert.strictEqual(getPendingReviewCount('chat-stable'), 1);
    assert.strictEqual(getPendingReviewCount('chat-racing-1'), 0);
    assert.strictEqual(getPendingReviewCount('chat-racing-2'), 0);
});

test('75. Strict equality is used for chat identity', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    let handler = null;
    let callCount = 0;

    setupMockDom();

    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            if (callCount === 1) {
                return {
                    event_types: { MESSAGE_RECEIVED: 'message_received' },
                    eventSource: {
                        on(event, fn) {
                            handler = fn;
                        },
                    },
                };
            }
            if (callCount === 2) {
                return {
                    chatId: '100',
                    chat: [{ mes: rawMessage, is_user: false }],
                    chatMetadata: {
                        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
                    },
                };
            }
            return {
                chatId: 100,
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {
                    [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
                },
            };
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('76. Numeric 0 chat identity is not rejected by truthiness check', async () => {
    let querySelectorCalls = 0;
    globalThis.document = {
        querySelector(selector) {
            querySelectorCalls += 1;
            return { parentElement: null, style: { backgroundColor: 'rgb(24, 24, 24)' } };
        },
    };
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(24, 24, 24)' });

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 0,
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        },
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.ok(querySelectorCalls > 0);
});

test('77. Duplicate event in Review uses upsert behavior', async () => {
    const chat = [
        {
            mes: '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
            is_user: false,
        },
    ];
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    const handler = getHandler();
    handler(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');

    chat[0] = {
        mes: '[c1]Updated.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->',
        is_user: false,
    };

    handler(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Bob');
});

test('78. Duplicate event in Automatic uses upsert behavior', async () => {
    const chat = [
        {
            mes: '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
            is_user: false,
        },
    ];
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    const handler = getHandler();
    handler(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');

    chat[0] = {
        mes: '[c1]Updated.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->',
        is_user: false,
    };

    handler(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Bob');
    await settleQueue();
});

test('79. Different chats with different modes remain independent', async () => {
    setupMockDom();

    let currentChatId = 'chat-a';
    const chatA = [
        {
            mes: '[c1]Hello A.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
            is_user: false,
        },
    ];
    const metadataA = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_OFF,
    };

    const chatB = [
        {
            mes: '[c1]Hello B.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->',
            is_user: false,
        },
    ];
    const metadataB = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: currentChatId,
                chat: currentChatId === 'chat-a' ? chatA : chatB,
                chatMetadata: currentChatId === 'chat-a' ? metadataA : metadataB,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
            };
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);
    assert.strictEqual(getPendingReviewCount('chat-a'), 0);

    currentChatId = 'chat-b';
    handler(0);
    assert.strictEqual(getPendingReviewCount('chat-a'), 0);
    assert.strictEqual(getPendingReviewCount('chat-b'), 1);
    assert.strictEqual(getPendingReview('chat-b', 0).proposals[0].name, 'Bob');

    currentChatId = 'chat-a';
    handler(0);
    assert.strictEqual(getPendingReviewCount('chat-a'), 0);
    assert.strictEqual(getPendingReviewCount('chat-b'), 1);
});

test('80. Switching to Automatic does not auto-process old Review cards', async () => {
    let saveCount = 0;
    const rawMessage1 = '[c1]Msg 1.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const rawMessage2 = '[c1]Msg 2.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->';
    const chat = [
        { mes: rawMessage1, is_user: false },
        { mes: rawMessage2, is_user: false },
    ];
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat,
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveCount += 1;
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_AUTOMATIC;

    handler(1);

    await waitFor(() => saveCount === 1);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Bob');
});

test('81. Raw message remains unchanged in Off, Review, and Automatic', async () => {
    const rawMessage = '[c1]Raw dialogue.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const messageObj = Object.freeze({
        mes: rawMessage,
        is_user: false,
    });
    const chat = Object.freeze([messageObj]);
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_OFF,
    };

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
        chatMetadata: metadata,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    const handler = getHandler();

    handler(0);
    assert.strictEqual(messageObj.mes, rawMessage);

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_REVIEW;
    handler(0);
    assert.strictEqual(messageObj.mes, rawMessage);

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_AUTOMATIC;
    handler(0);
    assert.strictEqual(messageObj.mes, rawMessage);
    await settleQueue();
});

test('82. No metadata persistence in Off or Review mode', async () => {
    let saveMetadataCalled = false;
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_OFF,
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveMetadataCalled = true;
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);
    assert.strictEqual(saveMetadataCalled, false);

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_REVIEW;
    handler(0);
    assert.strictEqual(saveMetadataCalled, false);
});

test('83. Multi-proposal assistant message in Automatic keeps proposals atomic', async () => {
    const rawMessage = [
        '[c1]First speaker.[/c] [c2]Second speaker.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->',
    ].join('\n');

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    const review = getPendingReview('chat-1', 0);
    assert.strictEqual(review.proposals.length, 2);
    assert.strictEqual(review.proposals[0].id, 'c1');
    assert.strictEqual(review.proposals[0].name, 'Alice');
    assert.strictEqual(review.proposals[1].id, 'c2');
    assert.strictEqual(review.proposals[1].name, 'Bob');
    await settleQueue();
});

const runtimeSource = fs.readFileSync(
    new URL('../src/message-runtime.js', import.meta.url),
    'utf8'
);

test('84. Source imports readActiveChatMode from mode-store.js', () => {
    assert.match(
        runtimeSource,
        /import\s+[^;]*readActiveChatMode[^;]*from\s+['"]\.\/mode-store\.js['"]/
    );
});

test('85. Source imports operation mode constants', () => {
    assert.match(runtimeSource, /OPERATION_MODE_OFF/);
    assert.match(runtimeSource, /OPERATION_MODE_REVIEW/);
    assert.match(runtimeSource, /OPERATION_MODE_AUTOMATIC/);
});

test('86. Source does not import review-approval-service', () => {
    assert.doesNotMatch(runtimeSource, /review-approval-service/);
});

test('87. Source does not import registration-service', () => {
    assert.doesNotMatch(runtimeSource, /registration-service/);
});

test('88. Source does not import chat-store save functions', () => {
    assert.doesNotMatch(runtimeSource, /saveActiveChatState/);
    assert.doesNotMatch(runtimeSource, /saveMetadata/);
});

test('89. Source contains no direct chromatic_dialogue_mode metadata access', () => {
    assert.doesNotMatch(runtimeSource, /chromatic_dialogue_mode/);
    assert.doesNotMatch(runtimeSource, /CHAT_MODE_METADATA_KEY/);
});

test('90. Source contains no automatic registration call', () => {
    assert.doesNotMatch(runtimeSource, /registerProposalsInActiveChat/);
    assert.doesNotMatch(runtimeSource, /approvePendingReview/);
});

test('91. Review still calls pending-store path', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    const review = getPendingReview('chat-1', 0);
    assert.strictEqual(review.messageId, 0);
    assert.strictEqual(review.proposals[0].name, 'Alice');
});

test('92. Review does not call/enqueue Automatic controller', async () => {
    let saveMetadataCalled = false;
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveMetadataCalled = true;
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    await settleQueue();

    assert.strictEqual(saveMetadataCalled, false);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.deepEqual(metadata[CHAT_METADATA_KEY].assignments, {});
});

test('93. Automatic routes to enqueueAutomaticReview', async () => {
    let saveMetadataCalled = false;
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveMetadataCalled = true;
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    await waitFor(() => saveMetadataCalled === true);
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Alice');
});

test('94. Automatic does not directly call putPendingReview in runtime branch', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        },
    });

    const storedEvents = [];
    const unsubscribe = subscribePendingReviewChanges((event) => {
        if (event.type === 'stored') {
            storedEvents.push(event);
        }
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(storedEvents.length, 1);
    assert.strictEqual(storedEvents[0].chatId, 'chat-1');
    assert.strictEqual(storedEvents[0].messageId, 0);

    unsubscribe();
    await settleQueue();
});

test('95. One Automatic event causes one controller enqueue', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        },
    });

    let storedCount = 0;
    const unsubscribe = subscribePendingReviewChanges((event) => {
        if (event.type === 'stored') {
            storedCount += 1;
        }
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(storedCount, 1);

    unsubscribe();
    await settleQueue();
});

test('96. Automatic review object contains exact chatId, messageId, and proposals', async () => {
    const rawMessage = '[c1]Speaking.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'custom-chat-uuid',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    const pending = getPendingReview('custom-chat-uuid', 0);
    assert.ok(pending);
    assert.strictEqual(pending.chatId, 'custom-chat-uuid');
    assert.strictEqual(pending.messageId, 0);
    assert.strictEqual(pending.proposals.length, 1);
    assert.strictEqual(pending.proposals[0].id, 'c1');
    assert.strictEqual(pending.proposals[0].name, 'Alice');
    assert.strictEqual(pending.proposals[0].proposedColor, '#56B4E9');

    await settleQueue();
});

test('97. Multi-proposal Automatic event enqueues exactly one review/job with proposals ordered', async () => {
    const rawMessage = [
        '[c1]First.[/c] [c2]Second.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->',
    ].join('\n');

    let storedCount = 0;
    const unsubscribe = subscribePendingReviewChanges((event) => {
        if (event.type === 'stored') {
            storedCount += 1;
        }
    });

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(storedCount, 1);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);

    const pending = getPendingReview('chat-1', 0);
    assert.strictEqual(pending.proposals.length, 2);
    assert.strictEqual(pending.proposals[0].id, 'c1');
    assert.strictEqual(pending.proposals[0].name, 'Alice');
    assert.strictEqual(pending.proposals[1].id, 'c2');
    assert.strictEqual(pending.proposals[1].name, 'Bob');

    unsubscribe();
    await settleQueue();
});

test('98. Unknown ready mode still uses manual Review path and does not enqueue Automatic', async () => {
    let saveMetadataCalled = false;
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: 'unrecognized_mode_val',
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveMetadataCalled = true;
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    await settleQueue();

    assert.strictEqual(saveMetadataCalled, false);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.deepEqual(metadata[CHAT_METADATA_KEY].assignments, {});
});

test('99. Off enqueues nothing and does not resolve runtime options', async () => {
    let querySelectorCalls = 0;
    globalThis.document = {
        querySelector() {
            querySelectorCalls += 1;
            return null;
        },
    };
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(24, 24, 24)' });

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_OFF,
        },
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(querySelectorCalls, 0);
    assert.strictEqual(getPendingReviewCount(), 0);
});

test('100. Mode / inspection chat mismatch enqueues nothing and stores no manual Review', async () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    let handler = null;
    let callCount = 0;

    setupMockDom();

    const modeContext = {
        chatId: 'chat-expected',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        },
    };

    const inspectorContext = {
        chatId: 'chat-other',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            if (callCount === 1) {
                return {
                    event_types: { MESSAGE_RECEIVED: 'message_received' },
                    eventSource: {
                        on(event, fn) {
                            handler = fn;
                        },
                    },
                };
            }
            if (callCount === 2) {
                return modeContext;
            }
            return inspectorContext;
        },
    };

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    assert.strictEqual(getPendingReviewCount(), 0);
});

test('101. Review -> Automatic switch affects next event immediately', async () => {
    let saveCount = 0;
    const rawMessage1 = '[c1]Msg 1.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const rawMessage2 = '[c1]Msg 2.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->';
    const chat = [
        { mes: rawMessage1, is_user: false },
        { mes: rawMessage2, is_user: false },
    ];
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat,
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveCount += 1;
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);
    await settleQueue();

    assert.strictEqual(saveCount, 0);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_AUTOMATIC;

    handler(1);

    await waitFor(() => saveCount === 1);

    assert.strictEqual(saveCount, 1);
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Bob');
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');
});

test('102. Automatic -> Review switch affects next event immediately', async () => {
    let saveCount = 0;
    const rawMessage1 = '[c1]Msg 1.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const rawMessage2 = '[c2]Msg 2.[/c]\n<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->';
    const chat = [
        { mes: rawMessage1, is_user: false },
        { mes: rawMessage2, is_user: false },
    ];
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat,
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveCount += 1;
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    await waitFor(() => saveCount === 1);
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Alice');
    assert.strictEqual(getPendingReviewCount('chat-1'), 0);

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_REVIEW;

    handler(1);
    await settleQueue();

    assert.strictEqual(saveCount, 1);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 1).proposals[0].name, 'Bob');
});

test('103. Automatic -> Off switch affects next event immediately', async () => {
    let saveCount = 0;
    const rawMessage1 = '[c1]Msg 1.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const rawMessage2 = '[c2]Msg 2.[/c]\n<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->';
    const chat = [
        { mes: rawMessage1, is_user: false },
        { mes: rawMessage2, is_user: false },
    ];
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat,
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveCount += 1;
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    await waitFor(() => saveCount === 1);
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Alice');

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_OFF;

    handler(1);
    await settleQueue();

    assert.strictEqual(saveCount, 1);
    assert.strictEqual(getPendingReviewCount('chat-1'), 0);
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c2, undefined);
});

test('104. No listener re-registration is needed for mode switching', async () => {
    let registeredCount = 0;
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        registeredCount += 1;
                        handler = fn;
                    },
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();
    assert.strictEqual(registeredCount, 1);

    handler(0);
    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_AUTOMATIC;
    handler(0);
    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_OFF;
    handler(0);

    assert.strictEqual(registeredCount, 1);
    await settleQueue();
});

test('105. Existing Review pending cards are not auto-enqueued after switching to Automatic', async () => {
    let saveCount = 0;
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveCount += 1;
                },
            };
        },
    };
    setupMockDom();

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);

    metadata[CHAT_MODE_METADATA_KEY] = OPERATION_MODE_AUTOMATIC;
    await settleQueue();

    assert.strictEqual(saveCount, 0);
    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');
    assert.deepEqual(metadata[CHAT_METADATA_KEY].assignments, {});
});

test('106. Automatic does not scan pending store', () => {
    assert.doesNotMatch(runtimeSource, /listPendingReviews/);
    assert.doesNotMatch(runtimeSource, /getPendingReviewCount/);
    assert.doesNotMatch(runtimeSource, /getPendingReview\b/);
});

test('107. Automatic does not call approvePendingReview directly', () => {
    assert.doesNotMatch(runtimeSource, /approvePendingReview/);
});

test('108. Automatic does not call registration-service directly', () => {
    assert.doesNotMatch(runtimeSource, /registration-service/);
    assert.doesNotMatch(runtimeSource, /registerProposalsInActiveChat/);
});

test('109. Automatic does not call saveActiveChatState directly', () => {
    assert.doesNotMatch(runtimeSource, /saveActiveChatState/);
});

test('110. Automatic does not call removePendingReview directly', () => {
    assert.doesNotMatch(runtimeSource, /removePendingReview/);
});

test('111. Source imports enqueueAutomaticReview from automatic-review-controller.js', () => {
    assert.match(
        runtimeSource,
        /import\s+[^;]*enqueueAutomaticReview[^;]*from\s+['"]\.\/automatic-review-controller\.js['"]/
    );
});

test('112. Source does not scan or list pending reviews', () => {
    assert.doesNotMatch(runtimeSource, /listPendingReviews/);
    assert.doesNotMatch(runtimeSource, /getPendingReviewCount/);
    assert.doesNotMatch(runtimeSource, /getPendingReview\b/);
    assert.doesNotMatch(runtimeSource, /removePendingReview/);
});

test('113. Duplicate received event delegates through controller each time', async () => {
    const rawMessage1 = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const rawMessage2 = '[c1]Updated.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->';
    const chat = [{ mes: rawMessage1, is_user: false }];

    const { getHandler } = setupContextWithChat({
        chatId: 'chat-1',
        chat,
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        },
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    const handler = getHandler();
    handler(0);

    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Alice');

    chat[0] = { mes: rawMessage2, is_user: false };
    handler(0);

    assert.strictEqual(getPendingReview('chat-1', 0).proposals[0].name, 'Bob');
    await settleQueue();
});

test('114. Falsy-but-present chat IDs (numeric 0) are handled correctly', async () => {
    let querySelectorCalls = 0;
    globalThis.document = {
        querySelector(selector) {
            querySelectorCalls += 1;
            return { parentElement: null, style: { backgroundColor: 'rgb(24, 24, 24)' } };
        },
    };
    globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(24, 24, 24)' });

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const { getHandler } = setupContextWithChat({
        chatId: 0,
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        },
        setupDom: false,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.ok(querySelectorCalls > 0);
    await settleQueue();
});

test('115. Real automatic integration test (full end-to-end through MESSAGE_RECEIVED)', async () => {
    let saveMetadataCalled = false;
    const rawMessage = '[c1]Hello from Alice.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-int-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveMetadataCalled = true;
                },
            };
        },
    };
    setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    await waitFor(() => saveMetadataCalled === true && getPendingReviewCount('chat-int-1') === 0);

    assert.strictEqual(saveMetadataCalled, true);
    assert.ok(metadata[CHAT_METADATA_KEY].assignments.c1);
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Alice');
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.color, '#56B4E9');
    assert.strictEqual(getPendingReviewCount('chat-int-1'), 0);
    assert.strictEqual(getPendingReview('chat-int-1', 0), null);
    const ctx = globalThis.SillyTavern.getContext();
    assert.strictEqual(ctx.chat[0].mes, rawMessage);
});

test('116. Automatic failure integration test (conflict leaves pending review available manually)', async () => {
    let saveCount = 0;
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    const chat = [{ mes: rawMessage, is_user: false }];
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-fail-1',
                chat,
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveCount += 1;
                },
            };
        },
    };
    setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    chat[0] = { mes: '[c1]Edited message without trailer.[/c]', is_user: false };

    await settleQueue();

    assert.strictEqual(saveCount, 0);
    assert.deepEqual(metadata[CHAT_METADATA_KEY].assignments, {});
    assert.strictEqual(getPendingReviewCount('chat-fail-1'), 1);
    const review = getPendingReview('chat-fail-1', 0);
    assert.ok(review);
    assert.strictEqual(review.proposals[0].name, 'Alice');
});

test('117. Competing automatic proposals (first-success-wins, competing remains pending)', async () => {
    let saveCount = 0;
    const rawAlice = '[c1]Alice speaking.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const rawBob = '[c1]Bob speaking.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#B86FD4"} -->';

    const chat = [
        { mes: rawAlice, is_user: false },
        { mes: rawBob, is_user: false },
    ];
    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-compete-1',
                chat,
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveCount += 1;
                },
            };
        },
    };
    setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);
    handler(1);

    await waitFor(() => saveCount === 1);
    await settleQueue();

    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Alice');
    assert.strictEqual(getPendingReview('chat-compete-1', 0), null);
    assert.strictEqual(getPendingReviewCount('chat-compete-1'), 1);
    const competingReview = getPendingReview('chat-compete-1', 1);
    assert.ok(competingReview);
    assert.strictEqual(competingReview.proposals[0].name, 'Bob');
});

test('118. Review mode accepts auxiliary content after registration block', async () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
        '',
        '<div class="arbitrary">',
        '    <div>Some auxiliary data.</div>',
        '</div>',
        '',
        '### Notes',
        '',
        'Anything can follow.',
    ].join('\n');

    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    const { getHandler, context } = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: metadata,
    });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    getHandler()(0);

    assert.strictEqual(getPendingReviewCount('chat-1'), 1);
    const review = getPendingReview('chat-1', 0);
    assert.ok(review);
    assert.strictEqual(review.chatId, 'chat-1');
    assert.strictEqual(review.messageId, 0);
    assert.strictEqual(review.proposals.length, 1);
    assert.strictEqual(review.proposals[0].id, 'c1');
    assert.strictEqual(review.proposals[0].name, 'Alice');
    assert.strictEqual(context.chat[0].mes, rawMessage);
    assert.deepEqual(metadata[CHAT_METADATA_KEY].assignments, {});
});

test('119. Automatic mode completes full pipeline with auxiliary suffix content', async () => {
    let saveMetadataCalled = false;
    const rawMessage = [
        '[c1]Hello from Alice with trailing auxiliary content.[/c]',
        '',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
        '',
        '<div class="auxiliary-container">',
        '    <section><span>Opaque block content</span></section>',
        '</div>',
        '',
        '### Auxiliary Notes',
        '',
        'Arbitrary trailing markdown and plain text follows here.',
    ].join('\n');

    const metadata = {
        [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };

    let handler = null;
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-auto-aux-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: metadata,
                event_types: { MESSAGE_RECEIVED: 'message_received' },
                eventSource: {
                    on(event, fn) {
                        handler = fn;
                    },
                },
                saveMetadata() {
                    saveMetadataCalled = true;
                },
            };
        },
    };
    setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    const { registerMessageReceivedRuntime } = await loadFreshRuntime();
    registerMessageReceivedRuntime();

    handler(0);

    await waitFor(() => saveMetadataCalled === true && getPendingReviewCount('chat-auto-aux-1') === 0);

    assert.strictEqual(saveMetadataCalled, true);
    assert.ok(metadata[CHAT_METADATA_KEY].assignments.c1);
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Alice');
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.color, '#56B4E9');
    assert.strictEqual(getPendingReviewCount('chat-auto-aux-1'), 0);
    assert.strictEqual(getPendingReview('chat-auto-aux-1', 0), null);
    const ctx = globalThis.SillyTavern.getContext();
    assert.strictEqual(ctx.chat[0].mes, rawMessage);
});
