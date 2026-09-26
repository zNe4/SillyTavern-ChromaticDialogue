import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    CHAT_MODE_METADATA_KEY,
    CHAT_METADATA_KEY,
    OPERATION_MODE_OFF,
    OPERATION_MODE_REVIEW,
    OPERATION_MODE_AUTOMATIC,
    DEFAULT_OPERATION_MODE,
} from '../src/constants.js';
import {
    readActiveChatMode,
    saveActiveChatMode,
} from '../src/mode-store.js';

afterEach(() => {
    delete globalThis.SillyTavern;
});

test('1. no active chat -> no-chat/null mode', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: null,
                chatMetadata: {},
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'no-chat',
        chatId: null,
        mode: null,
    });
});

test('2. active chat + absent mode key -> Review default', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {},
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: DEFAULT_OPERATION_MODE,
    });
});

test('3. stored off reads off', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {
                    [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_OFF,
                },
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: 'off',
    });
});

test('4. stored review reads review', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {
                    [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_REVIEW,
                },
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: 'review',
    });
});

test('5. stored automatic reads automatic', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {
                    [CHAT_MODE_METADATA_KEY]: OPERATION_MODE_AUTOMATIC,
                },
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: 'automatic',
    });
});

test('6. null raw mode falls back Review', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {
                    [CHAT_MODE_METADATA_KEY]: null,
                },
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: 'review',
    });
});

test('7. undefined own-property mode falls back Review', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {
                    [CHAT_MODE_METADATA_KEY]: undefined,
                },
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: 'review',
    });
});

test('8. boolean mode falls back Review', () => {
    for (const val of [true, false]) {
        globalThis.SillyTavern = {
            getContext() {
                return {
                    chatId: 'chat-1',
                    chatMetadata: {
                        [CHAT_MODE_METADATA_KEY]: val,
                    },
                };
            },
        };

        assert.deepEqual(readActiveChatMode(), {
            status: 'ready',
            chatId: 'chat-1',
            mode: 'review',
        });
    }
});

test('9. numeric mode falls back Review', () => {
    for (const val of [0, 1, 42, -1, NaN]) {
        globalThis.SillyTavern = {
            getContext() {
                return {
                    chatId: 'chat-1',
                    chatMetadata: {
                        [CHAT_MODE_METADATA_KEY]: val,
                    },
                };
            },
        };

        assert.deepEqual(readActiveChatMode(), {
            status: 'ready',
            chatId: 'chat-1',
            mode: 'review',
        });
    }
});

test('10. object mode falls back Review', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {
                    [CHAT_MODE_METADATA_KEY]: {},
                },
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: 'review',
    });
});

test('11. array mode falls back Review', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {
                    [CHAT_MODE_METADATA_KEY]: ['automatic'],
                },
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: 'review',
    });
});

test('12. "Automatic" falls back Review', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {
                    [CHAT_MODE_METADATA_KEY]: 'Automatic',
                },
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: 'review',
    });
});

test('13. "AUTOMATIC" falls back Review', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {
                    [CHAT_MODE_METADATA_KEY]: 'AUTOMATIC',
                },
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: 'review',
    });
});

test('14. padded " automatic " falls back Review', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {
                    [CHAT_MODE_METADATA_KEY]: ' automatic ',
                },
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: 'review',
    });
});

test('15. arbitrary string falls back Review', () => {
    for (const val of ['invalid', 'auto', 'OFF', 'Review', 'other']) {
        globalThis.SillyTavern = {
            getContext() {
                return {
                    chatId: 'chat-1',
                    chatMetadata: {
                        [CHAT_MODE_METADATA_KEY]: val,
                    },
                };
            },
        };

        assert.deepEqual(readActiveChatMode(), {
            status: 'ready',
            chatId: 'chat-1',
            mode: 'review',
        });
    }
});

test('16. invalid read never mutates metadata', () => {
    const chatMetadata = {
        [CHAT_MODE_METADATA_KEY]: 'INVALID_MODE',
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
            };
        },
    };

    const result = readActiveChatMode();

    assert.equal(result.mode, 'review');
    assert.equal(chatMetadata[CHAT_MODE_METADATA_KEY], 'INVALID_MODE');
});

test('17. invalid read never calls saveMetadata', () => {
    let saveCalls = 0;
    const chatMetadata = {
        [CHAT_MODE_METADATA_KEY]: 'corrupt',
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    readActiveChatMode();
    assert.equal(saveCalls, 0);
});

test('18. missing/null chatMetadata read falls back Review', () => {
    for (const metadata of [null, undefined]) {
        globalThis.SillyTavern = {
            getContext() {
                return {
                    chatId: 'chat-1',
                    chatMetadata: metadata,
                };
            },
        };

        assert.deepEqual(readActiveChatMode(), {
            status: 'ready',
            chatId: 'chat-1',
            mode: 'review',
        });
    }
});

test('19. primitive chatMetadata read falls back Review', () => {
    for (const primitive of ['metadata', 123, true]) {
        globalThis.SillyTavern = {
            getContext() {
                return {
                    chatId: 'chat-1',
                    chatMetadata: primitive,
                };
            },
        };

        assert.deepEqual(readActiveChatMode(), {
            status: 'ready',
            chatId: 'chat-1',
            mode: 'review',
        });
    }
});

test('20. array chatMetadata read falls back Review', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: ['not', 'an', 'object'],
            };
        },
    };

    assert.deepEqual(readActiveChatMode(), {
        status: 'ready',
        chatId: 'chat-1',
        mode: 'review',
    });
});

test('21. read calls fresh getContext each time', () => {
    let contextCalls = 0;
    const contexts = [
        { chatId: 'chat-a', chatMetadata: { [CHAT_MODE_METADATA_KEY]: 'off' } },
        { chatId: 'chat-b', chatMetadata: { [CHAT_MODE_METADATA_KEY]: 'automatic' } },
    ];

    globalThis.SillyTavern = {
        getContext() {
            return contexts[contextCalls++];
        },
    };

    const first = readActiveChatMode();
    const second = readActiveChatMode();

    assert.equal(contextCalls, 2);
    assert.equal(first.chatId, 'chat-a');
    assert.equal(first.mode, 'off');
    assert.equal(second.chatId, 'chat-b');
    assert.equal(second.mode, 'automatic');
});

test('22. requested invalid save mode returns invalid-mode', async () => {
    for (const invalid of ['OFF', ' Review ', 'Automatic', 'invalid', null, undefined, 123, true, {}]) {
        const result = await saveActiveChatMode('chat-1', invalid);
        assert.deepEqual(result, {
            status: 'invalid-mode',
            chatId: 'chat-1',
        });
    }
});

test('23. invalid requested mode does not call getContext', async () => {
    let contextCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            throw new Error('getContext must not be called');
        },
    };

    const result = await saveActiveChatMode('chat-1', 'INVALID_MODE');

    assert.deepEqual(result, {
        status: 'invalid-mode',
        chatId: 'chat-1',
    });
    assert.equal(contextCalls, 0);
});

test('24. save off succeeds', async () => {
    const chatMetadata = {};
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'off');

    assert.deepEqual(result, {
        status: 'saved',
        chatId: 'chat-1',
        mode: 'off',
    });
    assert.equal(saveCalls, 1);
    assert.equal(chatMetadata[CHAT_MODE_METADATA_KEY], 'off');
});

test('25. save review succeeds', async () => {
    const chatMetadata = {};
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'review');

    assert.deepEqual(result, {
        status: 'saved',
        chatId: 'chat-1',
        mode: 'review',
    });
    assert.equal(saveCalls, 1);
    assert.equal(chatMetadata[CHAT_MODE_METADATA_KEY], 'review');
});

test('26. save automatic succeeds', async () => {
    const chatMetadata = {};
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'automatic');

    assert.deepEqual(result, {
        status: 'saved',
        chatId: 'chat-1',
        mode: 'automatic',
    });
    assert.equal(saveCalls, 1);
    assert.equal(chatMetadata[CHAT_MODE_METADATA_KEY], 'automatic');
});

test('27. save canonical value exactly', async () => {
    const chatMetadata = {};

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    await saveActiveChatMode('chat-1', 'automatic');
    assert.strictEqual(chatMetadata[CHAT_MODE_METADATA_KEY], 'automatic');
});

test('28. save missing key initializes it', async () => {
    const chatMetadata = {};

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    assert.equal(Object.hasOwn(chatMetadata, CHAT_MODE_METADATA_KEY), false);
    await saveActiveChatMode('chat-1', 'off');
    assert.equal(Object.hasOwn(chatMetadata, CHAT_MODE_METADATA_KEY), true);
    assert.equal(chatMetadata[CHAT_MODE_METADATA_KEY], 'off');
});

test('29. saving over valid previous mode works', async () => {
    const chatMetadata = {
        [CHAT_MODE_METADATA_KEY]: 'review',
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'off');

    assert.deepEqual(result, {
        status: 'saved',
        chatId: 'chat-1',
        mode: 'off',
    });
    assert.equal(chatMetadata[CHAT_MODE_METADATA_KEY], 'off');
});

test('30. saving over malformed previous mode works', async () => {
    const chatMetadata = {
        [CHAT_MODE_METADATA_KEY]: 'BROKEN_MODE_123',
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'off');

    assert.deepEqual(result, {
        status: 'saved',
        chatId: 'chat-1',
        mode: 'off',
    });
    assert.equal(chatMetadata[CHAT_MODE_METADATA_KEY], 'off');
});

test('31. malformed assignment registry does not block mode save', async () => {
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: 'malformed assignments string',
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'off');

    assert.equal(result.status, 'saved');
    assert.equal(chatMetadata[CHAT_MODE_METADATA_KEY], 'off');
});

test('32. unsupported assignment schema does not block mode save', async () => {
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 999,
            assignments: {},
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'automatic');

    assert.equal(result.status, 'saved');
    assert.equal(chatMetadata[CHAT_MODE_METADATA_KEY], 'automatic');
});

test('33. mode save does not mutate assignment registry', async () => {
    const registryState = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
        },
    };
    const chatMetadata = {
        [CHAT_METADATA_KEY]: registryState,
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    await saveActiveChatMode('chat-1', 'off');

    assert.strictEqual(chatMetadata[CHAT_METADATA_KEY], registryState);
    assert.deepEqual(chatMetadata[CHAT_METADATA_KEY], {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
        },
    });
});

test('34. no chat returns no-chat', async () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: null,
                chatMetadata: {},
                async saveMetadata() {},
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'off');

    assert.deepEqual(result, {
        status: 'no-chat',
        chatId: null,
    });
});

test('35. no chat does not save', async () => {
    let saveCalls = 0;
    const chatMetadata = {};

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

    await saveActiveChatMode('chat-1', 'off');

    assert.equal(saveCalls, 0);
    assert.equal(Object.hasOwn(chatMetadata, CHAT_MODE_METADATA_KEY), false);
});

test('36. pre-save chat change returns chat-changed', async () => {
    const chatMetadata = {};

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-2',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'off');

    assert.deepEqual(result, {
        status: 'chat-changed',
        chatId: 'chat-2',
    });
});

test('37. pre-save chat change does not mutate', async () => {
    let saveCalls = 0;
    const chatMetadata = {};

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-2',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    await saveActiveChatMode('chat-1', 'off');

    assert.equal(saveCalls, 0);
    assert.equal(Object.hasOwn(chatMetadata, CHAT_MODE_METADATA_KEY), false);
});

test('38. null chatMetadata write returns invalid-state', async () => {
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: null,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'off');

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-1',
    });
    assert.equal(saveCalls, 0);
});

test('39. primitive chatMetadata write returns invalid-state', async () => {
    for (const primitive of ['string', 123, true]) {
        let saveCalls = 0;
        globalThis.SillyTavern = {
            getContext() {
                return {
                    chatId: 'chat-1',
                    chatMetadata: primitive,
                    async saveMetadata() {
                        saveCalls += 1;
                    },
                };
            },
        };

        const result = await saveActiveChatMode('chat-1', 'off');

        assert.deepEqual(result, {
            status: 'invalid-state',
            chatId: 'chat-1',
        });
        assert.equal(saveCalls, 0);
    }
});

test('40. array chatMetadata write returns invalid-state', async () => {
    let saveCalls = 0;
    const chatMetadata = [];

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'off');

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-1',
    });
    assert.equal(saveCalls, 0);
    assert.equal(chatMetadata.length, 0);
});

test('41. invalid container does not save', async () => {
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: undefined,
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    await saveActiveChatMode('chat-1', 'automatic');
    assert.equal(saveCalls, 0);
});

test('42. successful save calls saveMetadata exactly once', async () => {
    let saveCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {},
                async saveMetadata() {
                    saveCalls += 1;
                },
            };
        },
    };

    await saveActiveChatMode('chat-1', 'off');
    assert.equal(saveCalls, 1);
});

test('43. persistence error restores exact previous valid value', async () => {
    const chatMetadata = {
        [CHAT_MODE_METADATA_KEY]: 'review',
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {
                    throw new Error('Save error');
                },
            };
        },
    };

    await assert.rejects(
        saveActiveChatMode('chat-1', 'off'),
        /Save error/,
    );

    assert.strictEqual(chatMetadata[CHAT_MODE_METADATA_KEY], 'review');
});

test('44. persistence error restores exact previous malformed value', async () => {
    const chatMetadata = {
        [CHAT_MODE_METADATA_KEY]: 'MALFORMED_VALUE',
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {
                    throw new Error('Save error');
                },
            };
        },
    };

    await assert.rejects(
        saveActiveChatMode('chat-1', 'off'),
        /Save error/,
    );

    assert.strictEqual(chatMetadata[CHAT_MODE_METADATA_KEY], 'MALFORMED_VALUE');
});

test('45. persistence error deletes newly introduced key when originally absent', async () => {
    const chatMetadata = {};

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {
                    throw new Error('Save error');
                },
            };
        },
    };

    await assert.rejects(
        saveActiveChatMode('chat-1', 'off'),
        /Save error/,
    );

    assert.equal(Object.hasOwn(chatMetadata, CHAT_MODE_METADATA_KEY), false);
});

test('46. persistence error rethrows original exception', async () => {
    const expectedError = new Error('Custom persistence exception');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata: {},
                async saveMetadata() {
                    throw expectedError;
                },
            };
        },
    };

    await assert.rejects(
        saveActiveChatMode('chat-1', 'off'),
        (err) => err === expectedError,
    );
});

test('47. unrelated metadata keys remain untouched', async () => {
    const unrelated = { setting: 'dark-theme' };
    const chatMetadata = {
        unrelated,
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    await saveActiveChatMode('chat-1', 'off');

    assert.strictEqual(chatMetadata.unrelated, unrelated);
    assert.deepEqual(chatMetadata.unrelated, { setting: 'dark-theme' });
});

test('48. post-save chat remains same -> saved', async () => {
    const chatMetadata = {};

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    const result = await saveActiveChatMode('chat-1', 'automatic');

    assert.deepEqual(result, {
        status: 'saved',
        chatId: 'chat-1',
        mode: 'automatic',
    });
});

test('49. post-save chat change -> chat-changed with saved:true', async () => {
    const chatMetadataA = {};
    const chatMetadataB = {};
    let activeContext = {
        chatId: 'chat-1',
        chatMetadata: chatMetadataA,
        async saveMetadata() {
            activeContext = {
                chatId: 'chat-2',
                chatMetadata: chatMetadataB,
            };
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return activeContext;
        },
    };

    const result = await saveActiveChatMode('chat-1', 'off');

    assert.deepEqual(result, {
        status: 'chat-changed',
        chatId: 'chat-2',
        saved: true,
        mode: 'off',
    });
});

test('50. post-save chat change does not rollback successful persistence', async () => {
    const chatMetadataA = {};
    const chatMetadataB = {};
    let activeContext = {
        chatId: 'chat-1',
        chatMetadata: chatMetadataA,
        async saveMetadata() {
            activeContext = {
                chatId: 'chat-2',
                chatMetadata: chatMetadataB,
            };
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return activeContext;
        },
    };

    await saveActiveChatMode('chat-1', 'off');

    assert.equal(chatMetadataA[CHAT_MODE_METADATA_KEY], 'off');
    assert.equal(Object.hasOwn(chatMetadataB, CHAT_MODE_METADATA_KEY), false);
});

test('51. falsy but present chat IDs are compared strictly', async () => {
    const chatMetadata = {};

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 0,
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    const readRes = readActiveChatMode();
    assert.equal(readRes.status, 'ready');
    assert.strictEqual(readRes.chatId, 0);

    const sameSave = await saveActiveChatMode(0, 'off');
    assert.deepEqual(sameSave, {
        status: 'saved',
        chatId: 0,
        mode: 'off',
    });

    const diffTypeSave = await saveActiveChatMode('0', 'off');
    assert.deepEqual(diffTypeSave, {
        status: 'chat-changed',
        chatId: 0,
    });

    const falseSave = await saveActiveChatMode(false, 'off');
    assert.deepEqual(falseSave, {
        status: 'chat-changed',
        chatId: 0,
    });
});

test('52. candidate/requested mode input is never mutated', async () => {
    const candidateMode = 'off';
    const chatMetadata = {};

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {},
            };
        },
    };

    await saveActiveChatMode('chat-1', candidateMode);
    assert.equal(candidateMode, 'off');
});

test('53. read does not cache mode across chats', () => {
    let contextCalls = 0;
    const contexts = [
        { chatId: 'chat-a', chatMetadata: { [CHAT_MODE_METADATA_KEY]: 'off' } },
        { chatId: 'chat-b', chatMetadata: { [CHAT_MODE_METADATA_KEY]: 'automatic' } },
        { chatId: 'chat-a', chatMetadata: { [CHAT_MODE_METADATA_KEY]: 'review' } },
    ];

    globalThis.SillyTavern = {
        getContext() {
            return contexts[contextCalls++];
        },
    };

    assert.equal(readActiveChatMode().mode, 'off');
    assert.equal(readActiveChatMode().mode, 'automatic');
    assert.equal(readActiveChatMode().mode, 'review');
});

test('54. switching chats reads each chat independent mode', () => {
    const contexts = {
        'chat-1': { chatId: 'chat-1', chatMetadata: { [CHAT_MODE_METADATA_KEY]: 'off' } },
        'chat-2': { chatId: 'chat-2', chatMetadata: { [CHAT_MODE_METADATA_KEY]: 'automatic' } },
    };
    let activeId = 'chat-1';

    globalThis.SillyTavern = {
        getContext() {
            return contexts[activeId];
        },
    };

    assert.equal(readActiveChatMode().mode, 'off');
    activeId = 'chat-2';
    assert.equal(readActiveChatMode().mode, 'automatic');
});

test('55. missing mode in a second chat independently defaults Review', () => {
    const contexts = {
        'chat-1': { chatId: 'chat-1', chatMetadata: { [CHAT_MODE_METADATA_KEY]: 'off' } },
        'chat-2': { chatId: 'chat-2', chatMetadata: {} },
    };
    let activeId = 'chat-1';

    globalThis.SillyTavern = {
        getContext() {
            return contexts[activeId];
        },
    };

    assert.equal(readActiveChatMode().mode, 'off');
    activeId = 'chat-2';
    assert.equal(readActiveChatMode().mode, 'review');
});

test('56. no imports/coupling to assignment-registry normalization', () => {
    const fileContent = fs.readFileSync(
        new URL('../src/mode-store.js', import.meta.url),
        'utf8',
    );

    assert.equal(fileContent.includes('normalizeState'), false);
    assert.equal(fileContent.includes('normalizeStateForWrite'), false);
    assert.equal(fileContent.includes('registry.js'), false);
    assert.equal(fileContent.includes('registration-service.js'), false);
});

test('57. no pending-review imports', () => {
    const fileContent = fs.readFileSync(
        new URL('../src/mode-store.js', import.meta.url),
        'utf8',
    );

    assert.equal(fileContent.includes('review-panel'), false);
    assert.equal(fileContent.includes('review-approval-service'), false);
    assert.equal(fileContent.includes('pending'), false);
});

test('58. no runtime subscriptions', () => {
    const fileContent = fs.readFileSync(
        new URL('../src/mode-store.js', import.meta.url),
        'utf8',
    );

    assert.equal(fileContent.includes('eventSource'), false);
    assert.equal(fileContent.includes('event_types'), false);
    assert.equal(fileContent.includes('addEventListener'), false);
});

test('59. no DOM access', () => {
    const fileContent = fs.readFileSync(
        new URL('../src/mode-store.js', import.meta.url),
        'utf8',
    );

    assert.equal(fileContent.includes('document.'), false);
    assert.equal(fileContent.includes('window.'), false);
});

test('60. no production side effects on module import', () => {
    assert.equal(typeof readActiveChatMode, 'function');
    assert.equal(typeof saveActiveChatMode, 'function');
});

test('61. persistence failure unconditionally restores old raw mode despite in-save mutation', async () => {
    const expectedError = new Error('Save error after mutation');

    const chatMetadata = {
        [CHAT_MODE_METADATA_KEY]: 'BROKEN_BEFORE_SAVE',
    };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chatMetadata,
                async saveMetadata() {
                    chatMetadata[CHAT_MODE_METADATA_KEY] =
                        'INTERMEDIATE_VALUE';

                    throw expectedError;
                },
            };
        },
    };

    await assert.rejects(
        saveActiveChatMode('chat-1', 'off'),
        (error) => error === expectedError,
    );

    assert.equal(
        chatMetadata[CHAT_MODE_METADATA_KEY],
        'BROKEN_BEFORE_SAVE',
    );
});