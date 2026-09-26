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

test('missing metadata key still allows first save', async () => {
    const chatMetadata = {};
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const candidate = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
        },
    };

    const result = await saveActiveChatState('chat-a', candidate);

    assert.deepEqual(result, {
        status: 'saved',
        chatId: 'chat-a',
        state: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: '#112233' },
            },
        },
    });
    assert.equal(saveCalls, 1);
    assert.deepEqual(chatMetadata[CHAT_METADATA_KEY], {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
        },
    });
});

test('canonical existing state allows save', async () => {
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: '#112233' },
            },
        },
    };
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const candidate = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
            c2: { name: 'Bob', color: '#445566' },
        },
    };

    const result = await saveActiveChatState('chat-a', candidate);

    assert.deepEqual(result, {
        status: 'saved',
        chatId: 'chat-a',
        state: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: '#112233' },
                c2: { name: 'Bob', color: '#445566' },
            },
        },
    });
    assert.equal(saveCalls, 1);
    assert.deepEqual(chatMetadata[CHAT_METADATA_KEY], {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
            c2: { name: 'Bob', color: '#445566' },
        },
    });
});

test('safely normalizable existing name/color allows save', async () => {
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: '  Alice  ', color: ' #abcdef ' },
            },
        },
    };
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const candidate = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#ABCDEF' },
            c2: { name: 'Bob', color: '#445566' },
        },
    };

    const result = await saveActiveChatState('chat-a', candidate);

    assert.equal(result.status, 'saved');
    assert.equal(saveCalls, 1);
});

test('explicit null stored state blocks save', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: null,
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: { c1: { name: 'Alice', color: '#112233' } },
    });

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
    assert.strictEqual(chatMetadata[CHAT_METADATA_KEY], null);
});

test('primitive stored state blocks save', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: 'primitive string',
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
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
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
    assert.equal(chatMetadata[CHAT_METADATA_KEY], 'primitive string');
});

test('array stored state blocks save', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: [1, 2, 3],
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
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
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
    assert.deepEqual(chatMetadata[CHAT_METADATA_KEY], [1, 2, 3]);
});

test('missing schemaVersion blocks save', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            assignments: {},
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
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
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
});

test('unsupported schemaVersion blocks direct save', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 2,
            assignments: {},
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
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
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
});

test('non-object assignments blocks save', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: 'not-an-object',
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
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
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
});

test('invalid assignment ID blocks save', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c0: { name: 'Alice', color: '#112233' },
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
                },
            };
        },
    };

    const result = await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {},
    });

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
});

test('uppercase assignment ID blocks save', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                C1: { name: 'Alice', color: '#112233' },
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
                },
            };
        },
    };

    const result = await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {},
    });

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
});

test('non-object assignment blocks save', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: null,
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
                },
            };
        },
    };

    const result = await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {},
    });

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
});

test('empty assignment name blocks save', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: '   ', color: '#112233' },
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
                },
            };
        },
    };

    const result = await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {},
    });

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
});

test('invalid stored color blocks save', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: '#GGGGGG' },
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
                },
            };
        },
    };

    const result = await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {},
    });

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
});

test('malformed existing state is not mutated', async () => {
    const rawStored = {
        schemaVersion: 1,
        assignments: {
            c1: { name: '', color: '#112233' },
        },
    };
    const chatMetadata = {
        [CHAT_METADATA_KEY]: rawStored,
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: { c1: { name: 'Alice', color: '#112233' } },
    });

    assert.strictEqual(chatMetadata[CHAT_METADATA_KEY], rawStored);
    assert.deepEqual(rawStored, {
        schemaVersion: 1,
        assignments: {
            c1: { name: '', color: '#112233' },
        },
    });
});

test('malformed existing state does not call saveMetadata', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: 'invalid-color' },
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
                },
            };
        },
    };

    await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {},
    });

    assert.equal(saveCalls, 0);
});

test('valid candidate is not enough to bypass malformed source', async () => {
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: '', color: '#112233' },
            },
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    const validCandidate = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
        },
    };

    const result = await saveActiveChatState('chat-a', validCandidate);

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-a',
    });
});

test('candidate remains unmutated after blocked write', async () => {
    const candidate = {
        schemaVersion: 1,
        assignments: {
            c1: { name: '  Alice  ', color: ' #112233 ' },
        },
    };
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: '', color: '#112233' },
            },
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    await saveActiveChatState('chat-a', candidate);

    assert.equal(candidate.assignments.c1.name, '  Alice  ');
    assert.equal(candidate.assignments.c1.color, ' #112233 ');
});

test('unusable/null chatMetadata container returns invalid-state safely', async () => {
    for (const unusable of [null, undefined, 'string', 123, true]) {
        let saveCalls = 0;
        globalThis.SillyTavern = {
            getContext() {
                return {
                    chatId: 'chat-a',
                    chatMetadata: unusable,
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
            status: 'invalid-state',
            chatId: 'chat-a',
        });
        assert.equal(saveCalls, 0);
    }
});

test('array chatMetadata container blocks save and is not mutated', async () => {
    let saveCalls = 0;
    const chatMetadata = [];

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const candidate = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
        },
    };

    const result = await saveActiveChatState('chat-a', candidate);

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-a',
    });
    assert.equal(saveCalls, 0);
    assert.equal(
        Object.hasOwn(chatMetadata, CHAT_METADATA_KEY),
        false,
    );
    assert.equal(chatMetadata.length, 0);
    assert.deepEqual(chatMetadata, []);
});

test('rollback behavior still restores the exact previous raw state', async () => {
    const rawState = {
        schemaVersion: 1,
        assignments: {
            c1: {
                name: '  Alice  ',
                color: ' #112233 ',
            },
        },
    };
    const chatMetadata = {
        [CHAT_METADATA_KEY]: rawState,
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,
                async saveMetadata() {
                    throw new Error('Persistence failure');
                },
            };
        },
    };

    await assert.rejects(
        saveActiveChatState('chat-a', {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Bob', color: '#223344' },
            },
        }),
        /Persistence failure/,
    );

    assert.strictEqual(chatMetadata[CHAT_METADATA_KEY], rawState);
    assert.equal(chatMetadata[CHAT_METADATA_KEY].assignments.c1.name, '  Alice  ');
    assert.equal(chatMetadata[CHAT_METADATA_KEY].assignments.c1.color, ' #112233 ');
});

test('unrelated chatMetadata keys remain untouched', async () => {
    const unrelated = { settings: { theme: 'dark' }, counter: 42 };
    const chatMetadata = {
        unrelated,
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: '', color: '#112233' },
            },
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {},
    });

    assert.strictEqual(chatMetadata.unrelated, unrelated);
    assert.deepEqual(chatMetadata.unrelated, { settings: { theme: 'dark' }, counter: 42 });
});

test('no-chat still takes precedence after valid candidate', async () => {
    let getContextCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: '', color: '#112233' },
            },
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            getContextCalls += 1;
            return {
                chatId: null,
                chatMetadata,
                async saveMetadata() {},
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
    assert.equal(getContextCalls, 1);
});

test('chat-changed still takes precedence before source validation', async () => {
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: '', color: '#112233' },
            },
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-b',
                chatMetadata,
                async saveMetadata() {},
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
});

test('successful valid source write still performs exactly one saveMetadata call', async () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: '#112233' },
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
                },
            };
        },
    };

    const result = await saveActiveChatState('chat-a', {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
            c2: { name: 'Bob', color: '#445566' },
        },
    });

    assert.equal(result.status, 'saved');
    assert.equal(saveCalls, 1);
});