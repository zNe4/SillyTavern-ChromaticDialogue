import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { CHAT_METADATA_KEY } from '../src/constants.js';
import { inspectReceivedMessage } from '../src/message-inspector.js';

const validOptions = Object.freeze({
    backgroundColor: '#181818',
    minimumContrast: 4.5,
});

afterEach(() => {
    delete globalThis.SillyTavern;
});

test('1. Invalid message ID -> ignored / invalid-message-id', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    const invalidIds = [-1, NaN, Infinity, 'abc', null, undefined, {}, []];
    for (const badId of invalidIds) {
        assert.deepEqual(inspectReceivedMessage(badId, validOptions), {
            status: 'ignored',
            reason: 'invalid-message-id',
        });
    }
    assert.strictEqual(contextCalls, 0);
});

test('2. No active chat at message read -> ignored / no-chat', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: null,
                chat: [{ mes: 'Hello', is_user: false }],
            };
        },
    };

    assert.deepEqual(inspectReceivedMessage(0, validOptions), {
        status: 'ignored',
        reason: 'no-chat',
    });
});

test('3. Missing message -> ignored / message-missing', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [],
            };
        },
    };

    assert.deepEqual(inspectReceivedMessage(0, validOptions), {
        status: 'ignored',
        reason: 'message-missing',
    });
});

test('4. User message -> ignored / not-assistant-message', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: 'Hello from user', is_user: true }],
            };
        },
    };

    assert.deepEqual(inspectReceivedMessage(0, validOptions), {
        status: 'ignored',
        reason: 'not-assistant-message',
    });
});

test('5. System message -> ignored / not-assistant-message', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: 'System instructions', is_system: true }],
            };
        },
    };

    assert.deepEqual(inspectReceivedMessage(0, validOptions), {
        status: 'ignored',
        reason: 'not-assistant-message',
    });
});

test('6. Invalid raw message -> ignored / invalid-message', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: 12345, is_user: false }],
            };
        },
    };

    assert.deepEqual(inspectReceivedMessage(0, validOptions), {
        status: 'ignored',
        reason: 'invalid-message',
    });
});

test('7. Successful message with no CD_NEW -> no-proposals', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: 'Just ordinary conversation.', is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);
    assert.deepEqual(result, {
        status: 'no-proposals',
        chatId: 'chat-1',
        messageId: 0,
    });
});

test('8. no-proposals returns origin chatId/messageId', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-xyz',
                chat: [
                    { mes: 'First', is_user: false },
                    { mes: 'Second message text without trailer.', is_user: false },
                ],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage('1', validOptions);
    assert.deepEqual(result, {
        status: 'no-proposals',
        chatId: 'chat-xyz',
        messageId: 1,
    });
});

test('9. Valid new-character proposal -> ready', () => {
    const rawMessage = [
        '[c1]Hello world.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-abc',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.equal(result.status, 'ready');
    assert.equal(result.chatId, 'chat-abc');
    assert.equal(result.messageId, 0);
    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0].id, 'c1');
    assert.equal(result.proposals[0].name, 'Alice');
    assert.equal(result.proposals[0].proposedColor, '#56B4E9');
    assert.equal(result.proposals[0].color, '#56B4E9');
    assert.equal(result.proposals[0].colorAdjusted, false);
    assert.ok(result.proposals[0].contrastRatio >= 4.5);
});

test('10. ready preserves normalized message ID', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    const chat = [];
    chat[12] = { mes: rawMessage, is_user: false };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat,
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage('012', validOptions);

    assert.equal(result.status, 'ready');
    assert.strictEqual(result.messageId, 12);
    assert.strictEqual(typeof result.messageId, 'number');
});

test('11. ready returns prepared proposal properties exactly', () => {
    const rawMessage = [
        '[c1]Speaking.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Mara","color":"#e0e0e0"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, {
        backgroundColor: '#FFFFFF',
        minimumContrast: 4.5,
    });

    assert.equal(result.status, 'ready');
    const p = result.proposals[0];
    assert.equal(p.id, 'c1');
    assert.equal(p.name, 'Mara');
    assert.equal(p.proposedColor, '#E0E0E0');
    assert.equal(typeof p.color, 'string');
    assert.equal(p.colorAdjusted, true);
    assert.ok(p.contrastRatio >= 4.5);
    assert.deepEqual(Object.keys(p).sort(), [
        'color',
        'colorAdjusted',
        'contrastRatio',
        'id',
        'name',
        'proposedColor',
    ]);
});

test('12. ready proposal order is preserved', () => {
    const rawMessage = [
        '[c1]First.[/c]',
        '[c2]Second.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.equal(result.status, 'ready');
    assert.equal(result.proposals.length, 2);
    assert.equal(result.proposals[0].id, 'c1');
    assert.equal(result.proposals[0].name, 'Alice');
    assert.equal(result.proposals[1].id, 'c2');
    assert.equal(result.proposals[1].name, 'Bob');
});

test('13. ready proposals are detached', () => {
    const rawMessage = [
        '[c1]First.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result1 = inspectReceivedMessage(0, validOptions);
    result1.proposals[0].name = 'Mutated';
    result1.proposals.push({ id: 'injected' });

    const result2 = inspectReceivedMessage(0, validOptions);
    assert.equal(result2.proposals.length, 1);
    assert.equal(result2.proposals[0].name, 'Alice');
    assert.notStrictEqual(result1.proposals, result2.proposals);
    assert.notStrictEqual(result1.proposals[0], result2.proposals[0]);
});

test('14. Parser rejection -> rejected / parse-rejected', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW not-valid-json -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'parse-rejected',
        errors: ['invalid-json'],
    });
});

test('15. Parser error strings are preserved', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'parse-rejected',
        errors: ['invalid-proposal-shape'],
    });
});

test('16. Registry rejection -> rejected / registry-rejected', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {
                    [CHAT_METADATA_KEY]: {
                        schemaVersion: 1,
                        assignments: {
                            c1: { name: 'ExistingAlice', color: '#111111' },
                        },
                    },
                },
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.equal(result.status, 'rejected');
    assert.equal(result.chatId, 'chat-1');
    assert.equal(result.messageId, 0);
    assert.equal(result.reason, 'registry-rejected');
    assert.ok(result.errors.includes('id-already-assigned'));
});

test('17. Validator error strings are preserved', () => {
    const rawMessage = [
        '[c2]Hello.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {
                    [CHAT_METADATA_KEY]: {
                        schemaVersion: 1,
                        assignments: {
                            c1: { name: 'Alice', color: '#111111' },
                        },
                    },
                },
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'registry-rejected',
        errors: ['name-already-assigned'],
    });
});

test('18. Contrast rejection -> rejected / contrast-rejected', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#808080"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, {
        backgroundColor: '#777777',
        minimumContrast: 21,
    });

    assert.equal(result.status, 'rejected');
    assert.equal(result.reason, 'contrast-rejected');
    assert.ok(result.errors.includes('contrast-unreachable'));
});

test('19. Contrast error strings are preserved', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#808080"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, {
        backgroundColor: '#808080',
        minimumContrast: 10.0,
    });

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'contrast-rejected',
        errors: ['contrast-unreachable'],
    });
});

test('20. Invalid options -> rejected / invalid-options', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, null);

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'invalid-options',
        errors: ['invalid-options'],
    });
});

test('21. Invalid options errors are preserved', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, {
        backgroundColor: '#181818',
        minimumContrast: -5,
    });

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'invalid-options',
        errors: ['invalid-options'],
    });
});

test('22. Chat switches between message read and state read -> chat-changed', () => {
    const chatAContext = {
        chatId: 'chat-a',
        chat: [
            {
                mes: '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
                is_user: false,
            },
        ],
        chatMetadata: {},
    };

    const chatBContext = {
        chatId: 'chat-b',
        chat: [],
        chatMetadata: {},
    };

    let callCount = 0;
    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            return callCount === 1 ? chatAContext : chatBContext;
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.equal(result.status, 'chat-changed');
});

test('23. Chat-changed returns original chatId plus currentChatId', () => {
    const chatAContext = {
        chatId: 'chat-a',
        chat: [
            {
                mes: '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
                is_user: false,
            },
        ],
        chatMetadata: {},
    };

    const chatBContext = {
        chatId: 'chat-b',
        chat: [],
        chatMetadata: {},
    };

    let callCount = 0;
    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            return callCount === 1 ? chatAContext : chatBContext;
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.deepEqual(result, {
        status: 'chat-changed',
        chatId: 'chat-a',
        messageId: 0,
        currentChatId: 'chat-b',
    });
});

test('24. Chat disappears between reads -> chat-changed with currentChatId null', () => {
    const chatAContext = {
        chatId: 'chat-a',
        chat: [
            {
                mes: '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
                is_user: false,
            },
        ],
        chatMetadata: {},
    };

    const noChatContext = {
        chatId: null,
        chatMetadata: {},
    };

    let callCount = 0;
    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            return callCount === 1 ? chatAContext : noChatContext;
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.deepEqual(result, {
        status: 'chat-changed',
        chatId: 'chat-a',
        messageId: 0,
        currentChatId: null,
    });
});

test('25. Race failure prevents proposal preparation against the new chat', () => {
    const chatBMetadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'ChatBAlice', color: '#111111' },
            },
        },
    };

    const chatAContext = {
        chatId: 'chat-a',
        chat: [
            {
                mes: '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"ChatBAlice","color":"#56B4E9"} -->',
                is_user: false,
            },
        ],
        chatMetadata: {},
    };

    const chatBContext = {
        chatId: 'chat-b',
        chat: [],
        chatMetadata: chatBMetadata,
    };

    let callCount = 0;
    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            return callCount === 1 ? chatAContext : chatBContext;
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.equal(result.status, 'chat-changed');
    assert.equal(result.reason, undefined);
    assert.equal(result.errors, undefined);
    assert.equal(result.proposals, undefined);
});

test('26. Same chat on both reads processes normally', () => {
    const context = {
        chatId: 'chat-a',
        chat: [
            {
                mes: '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
                is_user: false,
            },
        ],
        chatMetadata: {},
    };

    let callCount = 0;
    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            return context;
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.equal(callCount, 2);
    assert.equal(result.status, 'ready');
    assert.equal(result.chatId, 'chat-a');
    assert.equal(result.proposals[0].name, 'Alice');
});

test('27. Unsupported schema + ordinary message -> no-proposals', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chat: [{ mes: 'Ordinary text without trailer.', is_user: false }],
                chatMetadata: {
                    [CHAT_METADATA_KEY]: {
                        schemaVersion: 99,
                        assignments: {},
                    },
                },
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.deepEqual(result, {
        status: 'no-proposals',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('28. Unsupported schema + valid CD_NEW proposal -> unsupported-schema', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {
                    [CHAT_METADATA_KEY]: {
                        schemaVersion: 99,
                        assignments: {},
                    },
                },
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.deepEqual(result, {
        status: 'unsupported-schema',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('29. Unsupported schema + malformed CD_NEW -> rejected / parse-rejected', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW not-valid-json -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {
                    [CHAT_METADATA_KEY]: {
                        schemaVersion: 99,
                        assignments: {},
                    },
                },
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-a',
        messageId: 0,
        reason: 'parse-rejected',
        errors: ['invalid-json'],
    });
});

test('30. Unsupported schema + invalid options -> rejected / invalid-options', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-a',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {
                    [CHAT_METADATA_KEY]: {
                        schemaVersion: 99,
                        assignments: {},
                    },
                },
            };
        },
    };

    const result = inspectReceivedMessage(0, { backgroundColor: 'not-a-color' });

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-a',
        messageId: 0,
        reason: 'invalid-options',
        errors: ['invalid-options'],
    });
});

test('31. readActiveChatState() exception -> ignored / state-unavailable', () => {
    let callCount = 0;
    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            if (callCount === 1) {
                return {
                    chatId: 'chat-a',
                    chat: [{ mes: 'Hello', is_user: false }],
                };
            }
            throw new Error('SillyTavern crashed during second context call');
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.deepEqual(result, {
        status: 'ignored',
        reason: 'state-unavailable',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('32. Raw message source is not mutated', () => {
    const originalText = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    const messageObj = Object.freeze({
        mes: originalText,
        is_user: false,
    });
    const chatArray = Object.freeze([messageObj]);

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: chatArray,
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.equal(result.status, 'ready');
    assert.strictEqual(messageObj.mes, originalText);
    assert.strictEqual(chatArray[0], messageObj);
});

test('33. Chat metadata is not mutated', () => {
    const originalAssignments = Object.freeze({
        c1: Object.freeze({ name: 'Alice', color: '#56B4E9' }),
    });
    const metadata = Object.freeze({
        [CHAT_METADATA_KEY]: Object.freeze({
            schemaVersion: 1,
            assignments: originalAssignments,
        }),
    });

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [
                    {
                        mes: '[c2]Bob here.[/c]\n<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->',
                        is_user: false,
                    },
                ],
                chatMetadata: metadata,
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.equal(result.status, 'ready');
    assert.equal(Object.keys(metadata[CHAT_METADATA_KEY].assignments).length, 1);
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1, originalAssignments.c1);
});

test('34. Options object is not mutated', () => {
    const options = {
        backgroundColor: '#181818',
        minimumContrast: 4.5,
    };
    const snapshot = JSON.stringify(options);

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [
                    {
                        mes: '[c1]Alice.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
                        is_user: false,
                    },
                ],
                chatMetadata: {},
            };
        },
    };

    inspectReceivedMessage(0, options);

    assert.equal(JSON.stringify(options), snapshot);
});

test('35. Returned errors are detached', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW not-valid-json -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result1 = inspectReceivedMessage(0, validOptions);
    result1.errors.push('injected');

    const result2 = inspectReceivedMessage(0, validOptions);
    assert.deepEqual(result2.errors, ['invalid-json']);
});

test('36. Repeated calls do not share mutable proposals', () => {
    const rawMessage = [
        '[c1]Hello.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMessage, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const first = inspectReceivedMessage(0, validOptions);
    const second = inspectReceivedMessage(0, validOptions);

    assert.deepEqual(first, second);
    assert.notStrictEqual(first.proposals, second.proposals);
    assert.notStrictEqual(first.proposals[0], second.proposals[0]);
});

test('37. Every invocation obtains fresh contexts', () => {
    let contextCount = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCount += 1;
            return {
                chatId: 'chat-1',
                chat: [{ mes: `Call ${contextCount}`, is_user: false }],
                chatMetadata: {},
            };
        },
    };

    inspectReceivedMessage(0, validOptions);
    assert.equal(contextCount, 2);

    inspectReceivedMessage(0, validOptions);
    assert.equal(contextCount, 4);
});

test('38. First call Chat A and later independent call Chat B each use their own state', () => {
    const contextA = {
        chatId: 'chat-a',
        chat: [
            {
                mes: '[c1]First.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
                is_user: false,
            },
        ],
        chatMetadata: {},
    };

    const contextB = {
        chatId: 'chat-b',
        chat: [
            {
                mes: '[c2]Second.[/c]\n<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->',
                is_user: false,
            },
        ],
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#56B4E9' },
                },
            },
        },
    };

    let activeContext = contextA;
    globalThis.SillyTavern = {
        getContext() {
            return activeContext;
        },
    };

    const resultA = inspectReceivedMessage(0, validOptions);
    assert.equal(resultA.status, 'ready');
    assert.equal(resultA.chatId, 'chat-a');
    assert.equal(resultA.proposals[0].id, 'c1');
    assert.equal(resultA.proposals[0].name, 'Alice');

    activeContext = contextB;
    const resultB = inspectReceivedMessage(0, validOptions);
    assert.equal(resultB.status, 'ready');
    assert.equal(resultB.chatId, 'chat-b');
    assert.equal(resultB.proposals[0].id, 'c2');
    assert.equal(resultB.proposals[0].name, 'Bob');
});

test('39. Function is synchronous and never returns a Promise', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: 'Synchronous test.', is_user: false }],
                chatMetadata: {},
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.notStrictEqual(result, null);
    assert.strictEqual(result instanceof Promise, false);
    assert.strictEqual(typeof result?.then, 'undefined');
    assert.strictEqual(result.status, 'no-proposals');
});

test('40. Module contains no event listener/persistence/DOM behavior', () => {
    assert.strictEqual(typeof globalThis.window, 'undefined');
    assert.strictEqual(typeof globalThis.document, 'undefined');

    const metadata = {};
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [
                    {
                        mes: '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
                        is_user: false,
                    },
                ],
                chatMetadata: metadata,
                saveMetadata() {
                    assert.fail('saveMetadata must not be called during inspection');
                },
            };
        },
    };

    const result = inspectReceivedMessage(0, validOptions);

    assert.equal(result.status, 'ready');
    assert.equal(Object.keys(metadata).length, 0);
});