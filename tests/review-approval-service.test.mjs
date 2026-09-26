import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { CHAT_METADATA_KEY } from '../src/constants.js';
import {
    putPendingReview,
    getPendingReview,
    clearAllPendingReviews,
} from '../src/pending-review-store.js';
import { approvePendingReview } from '../src/review-approval-service.js';

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
    saveMetadata = async () => {},
} = {}) {
    if (setupDom) {
        setupMockDom({ backgroundColor });
    }

    const context = {
        chatId,
        chat,
        chatMetadata,
        saveMetadata,
    };

    globalThis.SillyTavern = {
        getContext() {
            return context;
        },
    };

    return context;
}

beforeEach(() => {
    clearAllPendingReviews();
});

afterEach(() => {
    delete globalThis.SillyTavern;
    delete globalThis.document;
    delete globalThis.getComputedStyle;
    clearAllPendingReviews();
});

test('1. invalid chatId rejected', async () => {
    const badChatIds = ['', '   ', ' chat-1', 'chat-1 ', null, undefined, 123, {}, [], true];
    for (const badId of badChatIds) {
        const res = await approvePendingReview(badId, 0);
        assert.deepEqual(res, { status: 'invalid-review-key' });
    }
});

test('2. invalid messageId rejected', async () => {
    const badIds = [-1, -42, -0, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, null, undefined, {}, []];
    for (const badId of badIds) {
        const res = await approvePendingReview('chat-1', badId);
        assert.deepEqual(res, { status: 'invalid-review-key' });
    }
});

test('3. numeric-string messageId rejected', async () => {
    const stringIds = ['0', '1', '12', '00'];
    for (const stringId of stringIds) {
        const res = await approvePendingReview('chat-1', stringId);
        assert.deepEqual(res, { status: 'invalid-review-key' });
    }
});

test('4. no pending -> no-pending', async () => {
    setupContextWithChat({ chatId: 'chat-1', chat: [] });
    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'no-pending',
        chatId: 'chat-1',
        messageId: 0,
    });
});

test('5. wrong active chat -> chat-changed', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-2',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'chat-changed',
        chatId: 'chat-1',
        messageId: 0,
        currentChatId: 'chat-2',
    });
});

test('6. no active chat -> chat-changed/null', async () => {
    putPendingReview(createValidReview());
    setupContextWithChat({
        chatId: null,
        chat: [],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'chat-changed',
        chatId: 'chat-1',
        messageId: 0,
        currentChatId: null,
    });
});

test('7. source message missing -> source-unavailable', async () => {
    putPendingReview(createValidReview());
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'source-unavailable',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'message-missing',
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('8. user/system source -> source-unavailable', async () => {
    putPendingReview(createValidReview());
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: 'user text', is_user: true }],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'source-unavailable',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'not-assistant-message',
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('9. malformed current trailer -> stale-pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW invalid-json -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'stale-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'source-parse-rejected',
        errors: ['invalid-json'],
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('10. removed trailer -> stale-pending', async () => {
    putPendingReview(createValidReview());
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: '[c1]Hello without trailer.[/c]', is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'stale-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'source-no-proposals',
        errors: [],
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('11. changed ID -> stale-pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c2]Hello.[/c]\n<!-- CD_NEW {"id":"c2","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'stale-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'source-changed',
        errors: [],
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('12. changed name -> stale-pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Bob","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'stale-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'source-changed',
        errors: [],
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('13. changed proposed color -> stale-pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#FF0000"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'stale-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'source-changed',
        errors: [],
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('14. reordered multi-proposal source -> stale-pending', async () => {
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
                contrastRatio: 5.2,
            },
        ],
    }));

    const rawMessage = [
        '[c2]Second.[/c]',
        '[c1]First.[/c]',
        '<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
    ].join('\n');

    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'stale-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'source-changed',
        errors: [],
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('15. unchanged source proceeds', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(res.chatId, 'chat-1');
    assert.strictEqual(res.messageId, 0);
    assert.strictEqual(res.pendingRemoved, true);
});

test('16. unsupported schema blocks approval', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 99,
                assignments: {},
            },
        },
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'unsupported-schema',
        chatId: 'chat-1',
        messageId: 0,
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('17. already-applied single proposal reconciles', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#56B4E9' },
                },
            },
        },
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'already-applied',
        chatId: 'chat-1',
        messageId: 0,
        pendingRemoved: true,
    });
    assert.strictEqual(getPendingReview('chat-1', 0), null);
});

test('18. already-applied multi proposal reconciles', async () => {
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
                contrastRatio: 5.2,
            },
        ],
    }));

    const rawMessage = [
        '[c1]First.[/c]',
        '[c2]Second.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->',
    ].join('\n');

    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#111111' },
                    c2: { name: 'Bob', color: '#222222' },
                },
            },
        },
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'already-applied',
        chatId: 'chat-1',
        messageId: 0,
        pendingRemoved: true,
    });
    assert.strictEqual(getPendingReview('chat-1', 0), null);
});

test('19. already-applied ignores stored color difference', async () => {
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
        ],
    }));

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#999999' },
                },
            },
        },
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'already-applied');
    assert.strictEqual(res.pendingRemoved, true);
});

test('20. partial existing assignment is not treated already-applied', async () => {
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
                contrastRatio: 5.2,
            },
        ],
    }));

    const rawMessage = [
        '[c1]First.[/c]',
        '[c2]Second.[/c]',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
        '<!-- CD_NEW {"id":"c2","name":"Bob","color":"#B86FD4"} -->',
    ].join('\n');

    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#56B4E9' },
                },
            },
        },
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'registration-rejected');
    assert.strictEqual(res.reason, 'registry-rejected');
    assert.ok(res.errors.includes('id-already-assigned'));
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('21. mismatched existing name is not treated already-applied', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Charlie', color: '#56B4E9' },
                },
            },
        },
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'registration-rejected');
    assert.strictEqual(res.reason, 'registry-rejected');
    assert.ok(res.errors.includes('id-already-assigned'));
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('22. runtime options unavailable blocks approval', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        setupDom: false,
    });
    delete globalThis.document;

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'runtime-unavailable',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'dom-unavailable',
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('23. runtime options are resolved fresh at approval time', async () => {
    putPendingReview(createValidReview({
        proposals: [
            {
                id: 'c1',
                name: 'Mara',
                proposedColor: '#E0E0E0',
                color: '#E0E0E0',
                colorAdjusted: false,
                contrastRatio: 12.0,
            },
        ],
    }));

    const rawMessage = '[c1]Speaking.[/c]\n<!-- CD_NEW {"id":"c1","name":"Mara","color":"#e0e0e0"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        backgroundColor: 'rgb(255, 255, 255)',
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'approved');
    assert.notStrictEqual(res.added[0].color, '#E0E0E0');
});

test('24. fresh inspection no-proposals -> stale', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0, {
        inspectReceivedMessage: () => ({ status: 'no-proposals' }),
    });

    assert.deepEqual(res, {
        status: 'stale-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'source-no-proposals',
        errors: [],
    });
});

test('25. fresh inspection parse rejection maps correctly', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0, {
        inspectReceivedMessage: () => ({
            status: 'rejected',
            reason: 'parse-rejected',
            errors: ['invalid-json'],
        }),
    });

    assert.deepEqual(res, {
        status: 'registration-rejected',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'parse-rejected',
        errors: ['invalid-json'],
    });
});

test('26. fresh inspection registry rejection maps correctly', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0, {
        inspectReceivedMessage: () => ({
            status: 'rejected',
            reason: 'registry-rejected',
            errors: ['id-already-assigned'],
        }),
    });

    assert.deepEqual(res, {
        status: 'registration-rejected',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'registry-rejected',
        errors: ['id-already-assigned'],
    });
});

test('27. fresh inspection chat race -> chat-changed', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0, {
        inspectReceivedMessage: () => ({
            status: 'chat-changed',
            currentChatId: 'chat-2',
        }),
    });

    assert.deepEqual(res, {
        status: 'chat-changed',
        chatId: 'chat-1',
        messageId: 0,
        currentChatId: 'chat-2',
    });
});

test('28. second source comparison catches message changed between reads', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0, {
        inspectReceivedMessage: () => ({
            status: 'ready',
            chatId: 'chat-1',
            messageId: 0,
            proposals: [
                {
                    id: 'c1',
                    name: 'MutatedBob',
                    proposedColor: '#56B4E9',
                    color: '#56B4E9',
                    colorAdjusted: false,
                    contrastRatio: 4.5,
                },
            ],
        }),
    });

    assert.deepEqual(res, {
        status: 'stale-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'source-changed',
        errors: [],
    });
});

test('29. fresh contrast-adjusted color is sent to A6', async () => {
    putPendingReview(createValidReview({
        proposals: [
            {
                id: 'c1',
                name: 'Mara',
                proposedColor: '#E0E0E0',
                color: '#E0E0E0',
                colorAdjusted: false,
                contrastRatio: 12.0,
            },
        ],
    }));

    const rawMessage = '[c1]Speaking.[/c]\n<!-- CD_NEW {"id":"c1","name":"Mara","color":"#e0e0e0"} -->';
    let registeredProposals = null;

    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        backgroundColor: 'rgb(255, 255, 255)',
    });

    const res = await approvePendingReview('chat-1', 0, {
        registerProposalsInActiveChat: async (cid, proposals) => {
            registeredProposals = proposals;
            return {
                status: 'saved',
                state: { schemaVersion: 1, assignments: {} },
                added: proposals,
            };
        },
    });

    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(registeredProposals.length, 1);
    assert.strictEqual(registeredProposals[0].id, 'c1');
    assert.notStrictEqual(registeredProposals[0].color, '#E0E0E0');
});

test('30. old pending final color is NOT blindly sent to A6', async () => {
    putPendingReview(createValidReview({
        proposals: [
            {
                id: 'c1',
                name: 'Alice',
                proposedColor: '#56B4E9',
                color: '#999999',
                colorAdjusted: true,
                contrastRatio: 4.5,
            },
        ],
    }));

    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    let registeredProposals = null;

    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    await approvePendingReview('chat-1', 0, {
        registerProposalsInActiveChat: async (cid, proposals) => {
            registeredProposals = proposals;
            return {
                status: 'saved',
                state: { schemaVersion: 1, assignments: {} },
                added: proposals,
            };
        },
    });

    assert.strictEqual(registeredProposals[0].color, '#56B4E9');
    assert.notStrictEqual(registeredProposals[0].color, '#999999');
});

test('31. successful A6 save -> approved', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(res.chatId, 'chat-1');
    assert.strictEqual(res.messageId, 0);
    assert.strictEqual(res.added[0].name, 'Alice');
    assert.strictEqual(res.pendingRemoved, true);
});

test('32. approved result contains detached state/added data', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {};
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: metadata,
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'approved');

    res.state.assignments.c1.name = 'Mutated';
    res.added[0].name = 'Mutated';

    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Alice');
});

test('33. successful approval removes unchanged pending record', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(res.pendingRemoved, true);
    assert.strictEqual(getPendingReview('chat-1', 0), null);
});

test('34. successful approval does not remove a newer replacement pending record', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';

    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        saveMetadata: async () => {
            putPendingReview(createValidReview({
                proposals: [
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
        },
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(res.pendingRemoved, false);

    const remaining = getPendingReview('chat-1', 0);
    assert.strictEqual(remaining.proposals[0].id, 'c2');
    assert.strictEqual(remaining.proposals[0].name, 'Bob');
});

test('35. A6 rejected keeps pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0, {
        registerProposalsInActiveChat: async () => ({
            status: 'rejected',
            errors: ['duplicate-id'],
        }),
    });

    assert.deepEqual(res, {
        status: 'registration-rejected',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'registry-rejected',
        errors: ['duplicate-id'],
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('36. A6 unsupported schema keeps pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0, {
        registerProposalsInActiveChat: async () => ({
            status: 'unsupported-schema',
            chatId: 'chat-1',
        }),
    });

    assert.deepEqual(res, {
        status: 'unsupported-schema',
        chatId: 'chat-1',
        messageId: 0,
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('37. A6 no-chat keeps pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0, {
        registerProposalsInActiveChat: async () => ({
            status: 'no-chat',
            chatId: null,
        }),
    });

    assert.deepEqual(res, {
        status: 'chat-changed',
        chatId: 'chat-1',
        messageId: 0,
        currentChatId: null,
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('38. A6 chat-changed keeps pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0, {
        registerProposalsInActiveChat: async () => ({
            status: 'chat-changed',
            chatId: 'chat-2',
        }),
    });

    assert.deepEqual(res, {
        status: 'chat-changed',
        chatId: 'chat-1',
        messageId: 0,
        currentChatId: 'chat-2',
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('39. A6 invalid-state keeps pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0, {
        registerProposalsInActiveChat: async () => ({
            status: 'invalid-state',
            chatId: 'chat-1',
        }),
    });

    assert.deepEqual(res, {
        status: 'registration-failed',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'invalid-state',
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('40. unexpected A6 no-op keeps pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const res = await approvePendingReview('chat-1', 0, {
        registerProposalsInActiveChat: async () => ({
            status: 'no-op',
            chatId: 'chat-1',
        }),
    });

    assert.deepEqual(res, {
        status: 'registration-failed',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'unexpected-no-op',
    });
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('41. save exception -> persistence-error', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        saveMetadata: async () => {
            throw new Error('Disk write failed');
        },
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.deepEqual(res, {
        status: 'persistence-error',
        chatId: 'chat-1',
        messageId: 0,
    });
});

test('42. persistence exception keeps pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        saveMetadata: async () => {
            throw new Error('Disk write failed');
        },
    });

    await approvePendingReview('chat-1', 0);
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('43. already-applied removes unchanged pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#56B4E9' },
                },
            },
        },
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'already-applied');
    assert.strictEqual(res.pendingRemoved, true);
    assert.strictEqual(getPendingReview('chat-1', 0), null);
});

test('44. already-applied preserves a newer replacement pending', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    const replacement = createValidReview({
        proposals: [
            {
                id: 'c2',
                name: 'Bob',
                proposedColor: '#B86FD4',
                color: '#B86FD4',
                colorAdjusted: false,
                contrastRatio: 5.0,
            },
        ],
    });

    const res = await approvePendingReview('chat-1', 0, {
        readActiveChatState: () => {
            putPendingReview(replacement);

            return {
                status: 'ready',
                chatId: 'chat-1',
                state: {
                    schemaVersion: 1,
                    assignments: {
                        c1: {
                            name: 'Alice',
                            color: '#56B4E9',
                        },
                    },
                },
            };
        },
    });

    assert.deepEqual(res, {
        status: 'already-applied',
        chatId: 'chat-1',
        messageId: 0,
        pendingRemoved: false,
    });

    const preserved = getPendingReview('chat-1', 0);
    assert.notStrictEqual(preserved, null);
    assert.strictEqual(preserved.proposals[0].id, 'c2');
    assert.strictEqual(preserved.proposals[0].name, 'Bob');
});

test('45. same ID/name already persisted after ambiguous prior save can reconcile', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#56B4E9' },
                },
            },
        },
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'already-applied');
    assert.strictEqual(res.pendingRemoved, true);
    assert.strictEqual(getPendingReview('chat-1', 0), null);
});

test('46. source message is never mutated', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const messageObj = Object.freeze({ mes: rawMessage, is_user: false });
    const chat = Object.freeze([messageObj]);

    setupContextWithChat({
        chatId: 'chat-1',
        chat,
    });

    await approvePendingReview('chat-1', 0);
    assert.strictEqual(messageObj.mes, rawMessage);
    assert.strictEqual(chat[0], messageObj);
});

test('47. CD_NEW trailer remains unchanged', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const context = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    await approvePendingReview('chat-1', 0);
    assert.ok(context.chat[0].mes.includes('<!-- CD_NEW'));
});

test('48. chat metadata is modified only through A6', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const metadata = {};
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: metadata,
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Alice');
});

test('49. function returns a Promise', () => {
    const promise = approvePendingReview('chat-1', 0);
    assert.ok(promise instanceof Promise);
    assert.strictEqual(typeof promise.then, 'function');
});

test('50. no DOM mutation/UI functions are used', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    const mesText = setupMockDom({ backgroundColor: 'rgb(24, 24, 24)' });

    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        setupDom: false,
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(mesText.style.backgroundColor, 'rgb(24, 24, 24)');
});

test('51. ready message-reader result with falsy different chatId -> chat-changed', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    let parseCalled = false;
    const res = await approvePendingReview('chat-1', 0, {
        readActiveAssistantMessage: () => ({
            status: 'ready',
            chatId: '',
            messageId: 0,
            message: rawMessage,
        }),
        parseRegistrationTrailer: () => {
            parseCalled = true;
            return { ok: true, proposals: [], errors: [] };
        },
    });

    assert.deepEqual(res, {
        status: 'chat-changed',
        chatId: 'chat-1',
        messageId: 0,
        currentChatId: '',
    });
    assert.strictEqual(parseCalled, false);
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('52. inspection result with falsy different chatId -> chat-changed', async () => {
    putPendingReview(createValidReview());
    const rawMessage = '[c1]Hello.[/c]\n<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->';
    setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
    });

    let registerCalled = false;
    const res = await approvePendingReview('chat-1', 0, {
        inspectReceivedMessage: () => ({
            status: 'ready',
            chatId: '',
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
        }),
        registerProposalsInActiveChat: async () => {
            registerCalled = true;
            return {
                status: 'saved',
                state: { schemaVersion: 1, assignments: {} },
                added: [],
            };
        },
    });

    assert.deepEqual(res, {
        status: 'chat-changed',
        chatId: 'chat-1',
        messageId: 0,
        currentChatId: '',
    });
    assert.strictEqual(registerCalled, false);
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('53. unchanged source with auxiliary suffix after registration block proceeds to approval', async () => {
    putPendingReview(createValidReview());
    const rawMessage = [
        '[c1]Hello.[/c]',
        '',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
        '',
        '<div>',
        '    arbitrary auxiliary material',
        '</div>',
        '',
        '### Notes',
        'Additional text.',
    ].join('\n');
    const metadata = {};
    const context = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: metadata,
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(res.chatId, 'chat-1');
    assert.strictEqual(res.messageId, 0);
    assert.strictEqual(res.pendingRemoved, true);
    assert.strictEqual(getPendingReview('chat-1', 0), null);
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Alice');
    assert.strictEqual(context.chat[0].mes, rawMessage);
});

test('54. manual approval revalidates an unchanged toned-only source', async () => {
    putPendingReview(createValidReview());
    const rawMessage = [
        '[c1:measured]You should sit down before I explain.[/c]',
        '',
        '<!-- CD_NEW {"id":"c1","name":"Alice","color":"#56B4E9"} -->',
        '',
        '<div>',
        '    arbitrary auxiliary suffix',
        '</div>',
        '',
        '### Notes',
        'Additional notes.',
    ].join('\n');
    const metadata = {};
    const context = setupContextWithChat({
        chatId: 'chat-1',
        chat: [{ mes: rawMessage, is_user: false }],
        chatMetadata: metadata,
    });

    const res = await approvePendingReview('chat-1', 0);
    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(res.chatId, 'chat-1');
    assert.strictEqual(res.messageId, 0);
    assert.strictEqual(res.pendingRemoved, true);
    assert.strictEqual(getPendingReview('chat-1', 0), null);
    assert.strictEqual(metadata[CHAT_METADATA_KEY].assignments.c1.name, 'Alice');
    assert.strictEqual(context.chat[0].mes, rawMessage);
});
