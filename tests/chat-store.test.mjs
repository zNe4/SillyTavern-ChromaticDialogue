import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { CHAT_METADATA_KEY } from '../src/constants.js';
import {
    readActiveChatState,
    saveActiveChatState,
} from '../src/chat-store.js';

afterEach(() => {
    delete globalThis.SillyTavern;
});

test('reading without an active chat returns no-chat', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: null,
                chatMetadata: {},
            };
        },
    };

    assert.deepEqual(readActiveChatState(), {
        status: 'no-chat',
        chatId: null,
        state: null,
    });
});

test('missing and partially malformed metadata are read safely', () => {
    const contexts = [
        {
            chatId: 'chat-a',
            chatMetadata: {},
        },
        {
            chatId: 'chat-b',
            chatMetadata: {
                [CHAT_METADATA_KEY]: {
                    schemaVersion: 1,
                    assignments: {
                        c1: {
                            name: '  Alice  ',
                            color: ' #a1b2c3 ',
                        },
                        c2: {
                            name: '',
                            color: '#123456',
                        },
                        c100: {
                            name: 'Carol',
                            color: '#654321',
                        },
                    },
                },
            },
        },
    ];

    let contextIndex = 0;

    globalThis.SillyTavern = {
        getContext() {
            return contexts[contextIndex++];
        },
    };

    assert.deepEqual(readActiveChatState(), {
        status: 'ready',
        chatId: 'chat-a',
        state: {
            schemaVersion: 1,
            assignments: {},
        },
    });

    assert.deepEqual(readActiveChatState(), {
        status: 'ready',
        chatId: 'chat-b',
        state: {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Alice',
                    color: '#A1B2C3',
                },
            },
        },
    });
});

test('unsupported schemas are reported without interpretation', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata: {
                    [CHAT_METADATA_KEY]: {
                        schemaVersion: 2,
                        assignments: {
                            c1: {
                                name: 'Alice',
                                color: '#A1B2C3',
                            },
                        },
                    },
                },
            };
        },
    };

    assert.deepEqual(readActiveChatState(), {
        status: 'unsupported-schema',
        chatId: 'chat-a',
        state: null,
    });
});

test('every read obtains fresh context and returns detached state', () => {
    const firstMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Alice',
                    color: '#A1B2C3',
                },
            },
        },
    };

    const secondMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c2: {
                    name: 'Bob',
                    color: '#123456',
                },
            },
        },
    };

    let activeContext = {
        chatId: 'chat-a',
        chatMetadata: firstMetadata,
    };
    let contextCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return activeContext;
        },
    };

    const firstResult = readActiveChatState();

    activeContext = {
        chatId: 'chat-b',
        chatMetadata: secondMetadata,
    };

    const secondResult = readActiveChatState();

    assert.equal(contextCalls, 2);
    assert.equal(firstResult.chatId, 'chat-a');
    assert.equal(secondResult.chatId, 'chat-b');
    assert.notStrictEqual(
        firstResult.state,
        firstMetadata[CHAT_METADATA_KEY],
    );

    firstResult.state.assignments.c1.name = 'Changed';

    assert.equal(
        firstMetadata[CHAT_METADATA_KEY].assignments.c1.name,
        'Alice',
    );
});

test('invalid candidates are rejected before accessing chat context', async () => {
    let contextCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            throw new Error('Context must not be accessed');
        },
    };

    const result = await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: 'Alice',
                color: '#ABC',
            },
        },
    });

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(contextCalls, 0);
});

test('saving without an active chat does not mutate or persist metadata', async () => {
    const chatMetadata = {};
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: null,
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {},
    });

    assert.deepEqual(result, {
        status: 'no-chat',
        chatId: null,
    });
    assert.equal(saveCalls, 0);
    assert.equal(
        Object.hasOwn(chatMetadata, CHAT_METADATA_KEY),
        false,
    );
});

test('a chat switch prevents mutation and persistence', async () => {
    const chatMetadata = {};
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-b',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {},
    });

    assert.deepEqual(result, {
        status: 'chat-changed',
        chatId: 'chat-b',
    });
    assert.equal(saveCalls, 0);
    assert.equal(
        Object.hasOwn(chatMetadata, CHAT_METADATA_KEY),
        false,
    );
});

test('valid state is normalized and persisted in the expected chat', async () => {
    const chatMetadata = {
        unrelated: {
            preserved: true,
        },
    };
    let saveCalls = 0;

    const expectedState = {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: 'Alice',
                color: '#A1B2C3',
            },
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                    assert.deepEqual(
                        chatMetadata[CHAT_METADATA_KEY],
                        expectedState,
                    );
                },
            };
        },
    };

    const candidate = {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: '  Alice  ',
                color: ' #a1b2c3 ',
            },
        },
    };

    const result = await saveActiveChatState('chat-a', candidate);

    assert.deepEqual(result, {
        status: 'saved',
        chatId: 'chat-a',
        state: expectedState,
    });
    assert.equal(saveCalls, 1);
    assert.deepEqual(chatMetadata.unrelated, {
        preserved: true,
    });
    assert.equal(candidate.assignments.c1.name, '  Alice  ');
    assert.equal(candidate.assignments.c1.color, ' #a1b2c3 ');
});

test('a failed persistence restores the previous in-memory state', async () => {
    const previousState = {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: 'Original',
                color: '#111111',
            },
        },
    };
    const chatMetadata = {
        [CHAT_METADATA_KEY]: previousState,
        unrelated: {
            preserved: true,
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,

                async saveMetadata() {
                    assert.notStrictEqual(
                        chatMetadata[CHAT_METADATA_KEY],
                        previousState,
                    );
                    throw new Error('Persistence failed');
                },
            };
        },
    };

    await assert.rejects(
        saveActiveChatState('chat-a', {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Edited',
                    color: '#222222',
                },
            },
        }),
        /Persistence failed/,
    );

    assert.strictEqual(
        chatMetadata[CHAT_METADATA_KEY],
        previousState,
    );
    assert.deepEqual(chatMetadata.unrelated, {
        preserved: true,
    });
});

test('a failed first persistence removes its introduced in-memory state', async () => {
    const chatMetadata = {};

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,

                async saveMetadata() {
                    assert.equal(
                        Object.hasOwn(
                            chatMetadata,
                            CHAT_METADATA_KEY,
                        ),
                        true,
                    );
                    throw new Error('Persistence failed');
                },
            };
        },
    };

    await assert.rejects(
        saveActiveChatState('chat-a', {
            schemaVersion: 1,
            assignments: {},
        }),
        /Persistence failed/,
    );

    assert.equal(
        Object.hasOwn(chatMetadata, CHAT_METADATA_KEY),
        false,
    );
});

test('a chat switch while persistence is pending is reported safely', async () => {
    const originalMetadata = {};
    const newChatMetadata = {};
    let saveCalls = 0;

    const newContext = {
        chatId: 'chat-b',
        chatMetadata: newChatMetadata,
    };

    let activeContext = {
        chatId: 'chat-a',
        chatMetadata: originalMetadata,
        async saveMetadata() {
            saveCalls += 1;
            activeContext = newContext;
            await Promise.resolve();
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return activeContext;
        },
    };

    const result = await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: 'Alice',
                color: '#A1B2C3',
            },
        },
    });

    assert.deepEqual(result, {
        status: 'chat-changed',
        chatId: 'chat-b',
    });
    assert.equal(saveCalls, 1);
    assert.deepEqual(originalMetadata[CHAT_METADATA_KEY], {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: 'Alice',
                color: '#A1B2C3',
            },
        },
    });
    assert.equal(
        Object.hasOwn(newChatMetadata, CHAT_METADATA_KEY),
        false,
    );
});
