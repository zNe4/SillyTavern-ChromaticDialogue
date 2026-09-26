import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { readActiveAssistantMessage } from '../src/message-reader.js';

afterEach(() => {
    delete globalThis.SillyTavern;
});

test('numeric message ID succeeds', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-123',
                chat: [
                    { mes: 'First', is_user: false },
                    { mes: 'Second', is_user: false },
                ],
            };
        },
    };

    const result = readActiveAssistantMessage(1);

    assert.deepEqual(result, {
        status: 'ready',
        chatId: 'chat-123',
        messageId: 1,
        message: 'Second',
    });
});

test('numeric-string message ID succeeds', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-123',
                chat: [
                    { mes: 'Msg 0', is_user: false },
                    { mes: 'Msg 1', is_user: false },
                ],
            };
        },
    };

    const result = readActiveAssistantMessage('1');

    assert.deepEqual(result, {
        status: 'ready',
        chatId: 'chat-123',
        messageId: 1,
        message: 'Msg 1',
    });
});

test('numeric-string result ID is normalized to number', () => {
    const chat = [];
    chat[25] = { mes: 'Twenty-five', is_user: false };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-abc',
                chat,
            };
        },
    };

    const result = readActiveAssistantMessage('25');

    assert.strictEqual(result.messageId, 25);
    assert.strictEqual(typeof result.messageId, 'number');
    assert.strictEqual(result.status, 'ready');
});

test('ID zero succeeds', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: 'At zero', is_user: false }],
            };
        },
    };

    const numericResult = readActiveAssistantMessage(0);
    assert.deepEqual(numericResult, {
        status: 'ready',
        chatId: 'chat-1',
        messageId: 0,
        message: 'At zero',
    });

    const stringResult = readActiveAssistantMessage('0');
    assert.deepEqual(stringResult, {
        status: 'ready',
        chatId: 'chat-1',
        messageId: 0,
        message: 'At zero',
    });
});

test('leading-zero numeric string normalizes safely', () => {
    const chat = [
        { mes: 'Zero', is_user: false },
        { mes: 'One', is_user: false },
        { mes: 'Two', is_user: false },
    ];

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat,
            };
        },
    };

    const result = readActiveAssistantMessage('02');

    assert.deepEqual(result, {
        status: 'ready',
        chatId: 'chat-1',
        messageId: 2,
        message: 'Two',
    });
});

test('negative number rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(-1), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage(-42), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage(-0), {
        status: 'invalid-message-id',
    });
    assert.strictEqual(contextCalls, 0);
});

test('floating-point number rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(1.5), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage(0.1), {
        status: 'invalid-message-id',
    });
    assert.strictEqual(contextCalls, 0);
});

test('NaN rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(NaN), {
        status: 'invalid-message-id',
    });
    assert.strictEqual(contextCalls, 0);
});

test('Infinity rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(Infinity), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage(-Infinity), {
        status: 'invalid-message-id',
    });
    assert.strictEqual(contextCalls, 0);
});

test('empty string ID rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(''), {
        status: 'invalid-message-id',
    });
    assert.strictEqual(contextCalls, 0);
});

test('whitespace string ID rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(' '), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage('   '), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage('\t\n'), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage(' 1 '), {
        status: 'invalid-message-id',
    });
    assert.strictEqual(contextCalls, 0);
});

test('signed numeric string rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    assert.deepEqual(readActiveAssistantMessage('+1'), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage('-1'), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage('+0'), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage('-0'), {
        status: 'invalid-message-id',
    });
    assert.strictEqual(contextCalls, 0);
});

test('decimal numeric string rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    assert.deepEqual(readActiveAssistantMessage('1.5'), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage('0.0'), {
        status: 'invalid-message-id',
    });
    assert.strictEqual(contextCalls, 0);
});

test('exponent numeric string rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    assert.deepEqual(readActiveAssistantMessage('1e5'), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage('1E10'), {
        status: 'invalid-message-id',
    });
    assert.strictEqual(contextCalls, 0);
});

test('non-numeric string rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    assert.deepEqual(readActiveAssistantMessage('abc'), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage('c1'), {
        status: 'invalid-message-id',
    });
    assert.deepEqual(readActiveAssistantMessage('12a'), {
        status: 'invalid-message-id',
    });
    assert.strictEqual(contextCalls, 0);
});

test('null/undefined/object/array IDs rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    const invalidInputs = [null, undefined, {}, { id: 1 }, [], [1]];

    for (const input of invalidInputs) {
        assert.deepEqual(readActiveAssistantMessage(input), {
            status: 'invalid-message-id',
        });
    }
    assert.strictEqual(contextCalls, 0);
});

test('unsafe integer rejected', () => {
    let contextCalls = 0;
    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return { chatId: 'chat-1', chat: [] };
        },
    };

    assert.deepEqual(
        readActiveAssistantMessage(Number.MAX_SAFE_INTEGER + 1),
        { status: 'invalid-message-id' },
    );
    assert.deepEqual(
        readActiveAssistantMessage('9007199254740992'),
        { status: 'invalid-message-id' },
    );
    assert.deepEqual(
        readActiveAssistantMessage('999999999999999999999999999999'),
        { status: 'invalid-message-id' },
    );
    assert.strictEqual(contextCalls, 0);
});

test('missing SillyTavern fails safely as no-chat', () => {
    delete globalThis.SillyTavern;

    assert.deepEqual(readActiveAssistantMessage(0), {
        status: 'no-chat',
        chatId: null,
    });
});

test('missing getContext fails safely', () => {
    globalThis.SillyTavern = {};

    assert.deepEqual(readActiveAssistantMessage(0), {
        status: 'no-chat',
        chatId: null,
    });

    globalThis.SillyTavern = { getContext: 'not-a-function' };

    assert.deepEqual(readActiveAssistantMessage(0), {
        status: 'no-chat',
        chatId: null,
    });
});

test('throwing getContext fails safely', () => {
    globalThis.SillyTavern = {
        getContext() {
            throw new Error('SillyTavern context error');
        },
    };

    assert.deepEqual(readActiveAssistantMessage(0), {
        status: 'no-chat',
        chatId: null,
    });
});

test('null chatId -> no-chat', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: null,
                chat: [{ mes: 'Hello', is_user: false }],
            };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(0), {
        status: 'no-chat',
        chatId: null,
    });
});

test('undefined chatId -> no-chat', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: undefined,
                chat: [{ mes: 'Hello', is_user: false }],
            };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(0), {
        status: 'no-chat',
        chatId: null,
    });
});

test('invalid/non-array chat -> message-missing', () => {
    const invalidChats = [null, undefined, {}, 'not-an-array', 42];

    for (const badChat of invalidChats) {
        globalThis.SillyTavern = {
            getContext() {
                return {
                    chatId: 'chat-1',
                    chat: badChat,
                };
            },
        };

        assert.deepEqual(readActiveAssistantMessage(0), {
            status: 'message-missing',
            chatId: 'chat-1',
            messageId: 0,
        });
    }
});

test('out-of-range message index -> message-missing', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: 'Single message', is_user: false }],
            };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(5), {
        status: 'message-missing',
        chatId: 'chat-1',
        messageId: 5,
    });
});

test('missing array entry -> message-missing', () => {
    const chat = [];
    chat[2] = { mes: 'At index 2', is_user: false };

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat,
            };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(1), {
        status: 'message-missing',
        chatId: 'chat-1',
        messageId: 1,
    });
});

test('non-object message entry -> message-missing', () => {
    const chat = [null, 'string-entry', 123, true, []];

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat,
            };
        },
    };

    for (let index = 0; index < chat.length; index++) {
        assert.deepEqual(readActiveAssistantMessage(index), {
            status: 'message-missing',
            chatId: 'chat-1',
            messageId: index,
        });
    }
});

test('user message -> not-assistant-message', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: 'Hello from user', is_user: true }],
            };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(0), {
        status: 'not-assistant-message',
        chatId: 'chat-1',
        messageId: 0,
    });
});

test('system message -> not-assistant-message', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: 'System prompt', is_system: true }],
            };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(0), {
        status: 'not-assistant-message',
        chatId: 'chat-1',
        messageId: 0,
    });
});

test('non-string mes -> invalid-message', () => {
    const invalidMesValues = [null, undefined, 123, {}, []];

    for (const badMes of invalidMesValues) {
        globalThis.SillyTavern = {
            getContext() {
                return {
                    chatId: 'chat-1',
                    chat: [{ mes: badMes, is_user: false }],
                };
            },
        };

        assert.deepEqual(readActiveAssistantMessage(0), {
            status: 'invalid-message',
            chatId: 'chat-1',
            messageId: 0,
        });
    }
});

test('empty assistant message succeeds unchanged', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: '', is_user: false, is_system: false }],
            };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(0), {
        status: 'ready',
        chatId: 'chat-1',
        messageId: 0,
        message: '',
    });
});

test('whitespace-only assistant message succeeds unchanged', () => {
    const whitespaceMes = '   \n\t  ';

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: whitespaceMes, is_user: false, is_system: false }],
            };
        },
    };

    assert.deepEqual(readActiveAssistantMessage(0), {
        status: 'ready',
        chatId: 'chat-1',
        messageId: 0,
        message: whitespaceMes,
    });
});

test('raw HTML comment remains unchanged', () => {
    const rawCommentMessage = 'Before\n<!-- CD_NEW {"id":"c1"} -->\nAfter';

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawCommentMessage, is_user: false }],
            };
        },
    };

    const result = readActiveAssistantMessage(0);

    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(result.message, rawCommentMessage);
});

test('raw [cN] markers remain unchanged', () => {
    const rawMarkersMessage = '[c1]Hello[/c] and [c2]World[/c]';

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: rawMarkersMessage, is_user: false }],
            };
        },
    };

    const result = readActiveAssistantMessage(0);

    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(result.message, rawMarkersMessage);
});

test('full raw message is returned exactly', () => {
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#ff0000"} -->\n\n```js\nconst x = 1;\n```';

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-123',
                chat: [{ mes: rawMessage, is_user: false }],
            };
        },
    };

    const result = readActiveAssistantMessage(0);

    assert.deepEqual(result, {
        status: 'ready',
        chatId: 'chat-123',
        messageId: 0,
        message: rawMessage,
    });
});

test('source chat array is not mutated', () => {
    const originalEntry = Object.freeze({
        mes: 'Immutable message',
        is_user: false,
    });
    const chat = Object.freeze([originalEntry]);

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat,
            };
        },
    };

    const result = readActiveAssistantMessage(0);

    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(chat.length, 1);
    assert.strictEqual(chat[0], originalEntry);
});

test('source message object is not mutated', () => {
    const messageObject = Object.freeze({
        mes: 'Original text',
        is_user: false,
        extraProperty: { nested: true },
    });

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [messageObject],
            };
        },
    };

    const result = readActiveAssistantMessage(0);

    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(messageObject.mes, 'Original text');
    assert.deepEqual(messageObject.extraProperty, { nested: true });
});

test('every call retrieves fresh context', () => {
    let contextCalls = 0;

    globalThis.SillyTavern = {
        getContext() {
            contextCalls += 1;
            return {
                chatId: 'chat-1',
                chat: [{ mes: `Call ${contextCalls}`, is_user: false }],
            };
        },
    };

    const firstResult = readActiveAssistantMessage(0);
    const secondResult = readActiveAssistantMessage(0);

    assert.strictEqual(contextCalls, 2);
    assert.strictEqual(firstResult.message, 'Call 1');
    assert.strictEqual(secondResult.message, 'Call 2');
});

test('chat switch changes returned chatId and message correctly', () => {
    let currentContext = {
        chatId: 'chat-a',
        chat: [{ mes: 'From chat A', is_user: false }],
    };

    globalThis.SillyTavern = {
        getContext() {
            return currentContext;
        },
    };

    const firstResult = readActiveAssistantMessage(0);
    assert.strictEqual(firstResult.chatId, 'chat-a');
    assert.strictEqual(firstResult.message, 'From chat A');

    currentContext = {
        chatId: 'chat-b',
        chat: [{ mes: 'From chat B', is_user: false }],
    };

    const secondResult = readActiveAssistantMessage(0);
    assert.strictEqual(secondResult.chatId, 'chat-b');
    assert.strictEqual(secondResult.message, 'From chat B');
});

test('function is synchronous and never returns a Promise', () => {
    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: 'Sync check', is_user: false }],
            };
        },
    };

    const result = readActiveAssistantMessage(0);

    assert.notStrictEqual(result, null);
    assert.strictEqual(result instanceof Promise, false);
    assert.strictEqual(typeof result?.then, 'undefined');
    assert.strictEqual(result.status, 'ready');
});

test('no DOM behavior is involved', () => {
    assert.strictEqual(typeof globalThis.document, 'undefined');
    assert.strictEqual(typeof globalThis.window, 'undefined');

    globalThis.SillyTavern = {
        getContext() {
            return {
                chatId: 'chat-1',
                chat: [{ mes: 'No DOM involved', is_user: false }],
            };
        },
    };

    const result = readActiveAssistantMessage(0);
    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(result.message, 'No DOM involved');
});