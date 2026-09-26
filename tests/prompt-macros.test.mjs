// tests/prompt-macros.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_METADATA_KEY } from '../src/constants.js';

/**
 * Load a fresh module instance to test registration isolation.
 *
 * @param {string} tag
 * @returns {Promise<typeof import('../src/prompt-macros.js')>}
 */
async function loadFreshPromptMacros(tag) {
    const moduleUrl = new URL(
        `../src/prompt-macros.js?test=${tag}-${Date.now()}-${Math.random()}`,
        import.meta.url,
    );

    return import(moduleUrl);
}

/**
 * Setup a mock SillyTavern environment.
 *
 * @param {object} options
 * @param {string | null} [options.chatId]
 * @param {object} [options.chatMetadata]
 * @param {boolean} [options.hasMacros]
 * @param {boolean} [options.hasRegisterMethod]
 */
function createMockEnvironment({
    chatId = null,
    chatMetadata = {},
    hasMacros = true,
    hasRegisterMethod = true,
} = {}) {
    const registeredMacros = new Map();
    let registerCallCount = 0;

    const mockMacros = hasMacros
        ? {
              register: hasRegisterMethod
                  ? (name, definition) => {
                        registerCallCount += 1;
                        registeredMacros.set(name, definition);
                    }
                  : undefined,
          }
        : undefined;

    let activeChatId = chatId;
    let activeChatMetadata = chatMetadata;

    const context = {
        get chatId() {
            return activeChatId;
        },
        get chatMetadata() {
            return activeChatMetadata;
        },
        macros: mockMacros,
    };

    return {
        registeredMacros,
        getRegisterCallCount: () => registerCallCount,
        setChat(id, metadata) {
            activeChatId = id;
            activeChatMetadata = metadata;
        },
        mockSillyTavern: {
            getContext() {
                return context;
            },
        },
    };
}

test('1 & 2. exactly four macros are registered with exact expected names', async (t) => {
    const env = createMockEnvironment({ chatId: 'chat-1' });
    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('exact-names');
    const result = registerPromptMacros();

    assert.equal(result, true);
    assert.equal(env.registeredMacros.size, 4);

    const registeredNames = Array.from(env.registeredMacros.keys());
    assert.deepEqual(registeredNames, [
        'cdCount',
        'cdNext',
        'cdRoster',
        'cdState',
    ]);

    for (const name of registeredNames) {
        const definition = env.registeredMacros.get(name);
        assert.equal(typeof definition.description, 'string');
        assert.ok(definition.description.length > 0);
        assert.equal(typeof definition.handler, 'function');
    }
});

test('3. calling registerPromptMacros twice does not double-register them', async (t) => {
    const env = createMockEnvironment({ chatId: 'chat-1' });
    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('idempotent');

    const firstCall = registerPromptMacros();
    assert.equal(firstCall, true);
    assert.equal(env.registeredMacros.size, 4);
    assert.equal(env.getRegisterCallCount(), 4);

    const secondCall = registerPromptMacros();
    assert.equal(secondCall, false);
    assert.equal(env.registeredMacros.size, 4);
    assert.equal(env.getRegisterCallCount(), 4);
});

test('4. ready chat produces exact values', async (t) => {
    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: {
                    name: 'Catherine',
                    color: '#56B4E9',
                },
                c3: {
                    name: 'Maria',
                    color: '#E69F00',
                },
            },
        },
    };

    const env = createMockEnvironment({
        chatId: 'chat-ready',
        chatMetadata,
    });

    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('ready-chat');
    registerPromptMacros();

    const cdCount = env.registeredMacros.get('cdCount').handler();
    const cdNext = env.registeredMacros.get('cdNext').handler();
    const cdRoster = env.registeredMacros.get('cdRoster').handler();
    const cdState = env.registeredMacros.get('cdState').handler();

    assert.equal(cdCount, '2');
    assert.equal(cdNext, 'c2');
    assert.equal(cdRoster, 'c1=Catherine; c3=Maria');
    assert.equal(cdState, 'count=2; roster=c1=Catherine,c3=Maria; next=c2');
});

test('5. empty active chat distinguishes next=c1', async (t) => {
    const env = createMockEnvironment({
        chatId: 'empty-chat',
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {},
            },
        },
    });

    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('empty-chat');
    registerPromptMacros();

    const cdCount = env.registeredMacros.get('cdCount').handler();
    const cdNext = env.registeredMacros.get('cdNext').handler();
    const cdRoster = env.registeredMacros.get('cdRoster').handler();
    const cdState = env.registeredMacros.get('cdState').handler();

    assert.equal(cdCount, '0');
    assert.equal(cdNext, 'c1');
    assert.equal(cdRoster, '');
    assert.equal(cdState, 'count=0; roster=; next=c1');
});

test('6. no active chat safely uses next=none', async (t) => {
    const env = createMockEnvironment({
        chatId: null,
        chatMetadata: {},
    });

    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('no-chat');
    registerPromptMacros();

    const cdCount = env.registeredMacros.get('cdCount').handler();
    const cdNext = env.registeredMacros.get('cdNext').handler();
    const cdRoster = env.registeredMacros.get('cdRoster').handler();
    const cdState = env.registeredMacros.get('cdState').handler();

    assert.equal(cdCount, '0');
    assert.equal(cdNext, 'none');
    assert.equal(cdRoster, '');
    assert.equal(cdState, 'count=0; roster=; next=none');
});

test('7. unsupported schema uses count=unknown and next=none', async (t) => {
    const env = createMockEnvironment({
        chatId: 'chat-future-schema',
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 2,
                assignments: {
                    c1: {
                        name: 'Future Character',
                        color: '#FFFFFF',
                    },
                },
            },
        },
    });

    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('unsupported-schema');
    registerPromptMacros();

    const cdCount = env.registeredMacros.get('cdCount').handler();
    const cdNext = env.registeredMacros.get('cdNext').handler();
    const cdRoster = env.registeredMacros.get('cdRoster').handler();
    const cdState = env.registeredMacros.get('cdState').handler();

    assert.equal(cdCount, 'unknown');
    assert.equal(cdNext, 'none');
    assert.equal(cdRoster, '');
    assert.equal(cdState, 'count=unknown; roster=; next=none');
});

test('8. c1 + c3 produces next=c2', async (t) => {
    const env = createMockEnvironment({
        chatId: 'gap-chat',
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'First', color: '#111111' },
                    c3: { name: 'Third', color: '#333333' },
                },
            },
        },
    });

    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('gap-c2');
    registerPromptMacros();

    const cdNext = env.registeredMacros.get('cdNext').handler();
    assert.equal(cdNext, 'c2');
});

test('9. compact roster uses the existing registry escaping rules', async (t) => {
    const env = createMockEnvironment({
        chatId: 'escaping-chat',
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: {
                        name: 'Complex = and ; and , and \\ and \n and \r and \t test',
                        color: '#123456',
                    },
                },
            },
        },
    });

    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('escaping');
    registerPromptMacros();

    const cdRoster = env.registeredMacros.get('cdRoster').handler();
    const cdState = env.registeredMacros.get('cdState').handler();

    const expectedRoster =
        'c1=Complex \\= and \\; and \\, and \\\\ and \\n and \\r and \\t test';

    assert.equal(cdRoster, expectedRoster);
    assert.equal(cdState, `count=1; roster=${expectedRoster}; next=c2`);
});

test('10. full c1-c99 registry returns next=none', async (t) => {
    const assignments = {};

    for (let i = 1; i <= 99; i += 1) {
        assignments[`c${i}`] = {
            name: `Char${i}`,
            color: '#123456',
        };
    }

    const env = createMockEnvironment({
        chatId: 'full-chat',
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments,
            },
        },
    });

    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('full-registry');
    registerPromptMacros();

    const cdCount = env.registeredMacros.get('cdCount').handler();
    const cdNext = env.registeredMacros.get('cdNext').handler();
    const cdState = env.registeredMacros.get('cdState').handler();

    assert.equal(cdCount, '99');
    assert.equal(cdNext, 'none');
    assert.ok(cdState.endsWith('; next=none'));
});

test('11. macro handlers return strings synchronously, not Promises', async (t) => {
    const env = createMockEnvironment({
        chatId: 'sync-chat',
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#111111' },
                },
            },
        },
    });

    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('sync-check');
    registerPromptMacros();

    for (const name of ['cdCount', 'cdNext', 'cdRoster', 'cdState']) {
        const result = env.registeredMacros.get(name).handler();
        assert.equal(typeof result, 'string');
        assert.ok(!(result instanceof Promise));
    }
});

test('12. macro handlers read fresh state after a chat switch without re-registration', async (t) => {
    const chatAState = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Catherine', color: '#56B4E9' },
            },
        },
    };

    const chatBState = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'One', color: '#111111' },
                c2: { name: 'Two', color: '#222222' },
                c3: { name: 'Three', color: '#333333' },
                c4: { name: 'Four', color: '#444444' },
                c5: { name: 'Five', color: '#555555' },
            },
        },
    };

    const env = createMockEnvironment({
        chatId: 'chat-a',
        chatMetadata: chatAState,
    });

    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('fresh-state');
    registerPromptMacros();

    assert.equal(env.registeredMacros.get('cdCount').handler(), '1');
    assert.equal(env.registeredMacros.get('cdNext').handler(), 'c2');
    assert.equal(env.registeredMacros.get('cdRoster').handler(), 'c1=Catherine');

    env.setChat('chat-b', chatBState);

    assert.equal(env.registeredMacros.get('cdCount').handler(), '5');
    assert.equal(env.registeredMacros.get('cdNext').handler(), 'c6');
    assert.equal(
        env.registeredMacros.get('cdRoster').handler(),
        'c1=One; c2=Two; c3=Three; c4=Four; c5=Five',
    );

    env.setChat(null, {});

    assert.equal(env.registeredMacros.get('cdCount').handler(), '0');
    assert.equal(env.registeredMacros.get('cdNext').handler(), 'none');
    assert.equal(env.registeredMacros.get('cdRoster').handler(), '');
    assert.equal(
        env.registeredMacros.get('cdState').handler(),
        'count=0; roster=; next=none',
    );
});

test('13. missing macros API fails gracefully rather than throwing', async (t) => {
    const envNoMacros = createMockEnvironment({
        chatId: 'chat-1',
        hasMacros: false,
    });

    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = envNoMacros.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros: registerWithoutMacros } =
        await loadFreshPromptMacros('no-macros');

    assert.doesNotThrow(() => {
        const result = registerWithoutMacros();
        assert.equal(result, false);
    });

    const envNoRegisterMethod = createMockEnvironment({
        chatId: 'chat-1',
        hasMacros: true,
        hasRegisterMethod: false,
    });

    globalThis.SillyTavern = envNoRegisterMethod.mockSillyTavern;

    const { registerPromptMacros: registerWithoutMethod } =
        await loadFreshPromptMacros('no-register-method');

    assert.doesNotThrow(() => {
        const result = registerWithoutMethod();
        assert.equal(result, false);
    });
});

test('14. existing source state is not mutated by macro evaluation', async (t) => {
    const rawAssignments = {
        c1: { name: 'Catherine', color: '#56B4E9' },
        c3: { name: 'Maria', color: '#E69F00' },
    };

    const chatMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: rawAssignments,
        },
    };

    const env = createMockEnvironment({
        chatId: 'immutable-chat',
        chatMetadata,
    });

    const originalSillyTavern = globalThis.SillyTavern;
    globalThis.SillyTavern = env.mockSillyTavern;

    t.after(() => {
        globalThis.SillyTavern = originalSillyTavern;
    });

    const { registerPromptMacros } = await loadFreshPromptMacros('no-mutation');
    registerPromptMacros();

    env.registeredMacros.get('cdCount').handler();
    env.registeredMacros.get('cdNext').handler();
    env.registeredMacros.get('cdRoster').handler();
    env.registeredMacros.get('cdState').handler();

    assert.deepEqual(chatMetadata[CHAT_METADATA_KEY].assignments, {
        c1: { name: 'Catherine', color: '#56B4E9' },
        c3: { name: 'Maria', color: '#E69F00' },
    });
});