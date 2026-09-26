import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { CHAT_METADATA_KEY } from '../src/constants.js';
import { registerProposalsInActiveChat } from '../src/registration-service.js';

afterEach(() => {
    delete globalThis.SillyTavern;
});

function setMockContext({
    chatId = 'chat-a',
    metadata = {},
    onSave = null,
} = {}) {
    let saveCalls = 0;
    const context = {
        chatId,
        chatMetadata: metadata,
        async saveMetadata() {
            saveCalls += 1;
            if (onSave) {
                await onSave(context);
            }
        },
    };

    globalThis.SillyTavern = {
        getContext() {
            return context;
        },
    };

    return {
        context,
        getSaveCalls: () => saveCalls,
    };
}

test('1. matching active chat + one valid proposal -> saved', async () => {
    const { getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    const proposals = [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.deepEqual(result, {
        status: 'saved',
        chatId: 'chat-1',
        state: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: '#112233' },
            },
        },
        added: [
            { id: 'c1', name: 'Alice', color: '#112233' },
        ],
    });
    assert.equal(getSaveCalls(), 1);
});

test('2. matching active chat + multiple valid proposals -> all saved atomically', async () => {
    const { getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    const proposals = [
        { id: 'c1', name: 'Alice', color: '#112233' },
        { id: 'c2', name: 'Bob', color: '#445566' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.equal(result.status, 'saved');
    assert.equal(result.chatId, 'chat-1');
    assert.deepEqual(result.added, proposals);
    assert.deepEqual(result.state.assignments, {
        c1: { name: 'Alice', color: '#112233' },
        c2: { name: 'Bob', color: '#445566' },
    });
    assert.equal(getSaveCalls(), 1);
});

test('3. existing assignments remain present after registration', async () => {
    const { context } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#112233' },
                },
            },
        },
    });

    const proposals = [
        { id: 'c2', name: 'Bob', color: '#445566' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.equal(result.status, 'saved');
    assert.deepEqual(result.state.assignments, {
        c1: { name: 'Alice', color: '#112233' },
        c2: { name: 'Bob', color: '#445566' },
    });
    assert.deepEqual(context.chatMetadata[CHAT_METADATA_KEY].assignments, {
        c1: { name: 'Alice', color: '#112233' },
        c2: { name: 'Bob', color: '#445566' },
    });
});

test('4. gap allocation accepted through the validator', async () => {
    setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#112233' },
                    c3: { name: 'Charlie', color: '#334455' },
                },
            },
        },
    });

    const proposals = [
        { id: 'c2', name: 'Mara', color: '#B86FD4' },
        { id: 'c4', name: 'Jonas', color: '#68A9D8' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.equal(result.status, 'saved');
    assert.deepEqual(Object.keys(result.state.assignments).sort(), ['c1', 'c2', 'c3', 'c4']);
    assert.equal(result.state.assignments.c2.name, 'Mara');
    assert.equal(result.state.assignments.c4.name, 'Jonas');
});

test('5. empty proposal array -> no-op and no persistence call', async () => {
    const { getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#112233' },
                },
            },
        },
    });

    const result = await registerProposalsInActiveChat('chat-1', []);

    assert.deepEqual(result, {
        status: 'no-op',
        chatId: 'chat-1',
        state: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: '#112233' },
            },
        },
        added: [],
    });
    assert.equal(getSaveCalls(), 0);
});

test('6. no active chat -> no-chat', async () => {
    setMockContext({
        chatId: null,
    });

    const result = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ]);

    assert.deepEqual(result, {
        status: 'no-chat',
        chatId: null,
    });
});

test('7. active chat different from expectedChatId -> chat-changed', async () => {
    setMockContext({
        chatId: 'chat-b',
    });

    const result = await registerProposalsInActiveChat('chat-a', [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ]);

    assert.deepEqual(result, {
        status: 'chat-changed',
        chatId: 'chat-b',
    });
});

test('8. chat mismatch prevents proposal validation/persistence effects', async () => {
    const { context, getSaveCalls } = setMockContext({
        chatId: 'chat-b',
        metadata: {},
    });

    const result = await registerProposalsInActiveChat('chat-a', [
        { id: 'invalid', name: '', color: 'not-hex' },
    ]);

    assert.deepEqual(result, {
        status: 'chat-changed',
        chatId: 'chat-b',
    });
    assert.equal(getSaveCalls(), 0);
    assert.equal(Object.hasOwn(context.chatMetadata, CHAT_METADATA_KEY), false);
});

test('9. unsupported schema -> unsupported-schema', async () => {
    const { getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 2,
                assignments: {},
            },
        },
    });

    const result = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ]);

    assert.deepEqual(result, {
        status: 'unsupported-schema',
        chatId: 'chat-1',
    });
    assert.equal(getSaveCalls(), 0);
});

test('10. invalid proposals -> rejected with validator errors', async () => {
    const { getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    const result = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: '', color: '#112233' },
    ]);

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-1',
        errors: ['invalid-proposals'],
    });
    assert.equal(getSaveCalls(), 0);
});

test('11. wrong first-free ID -> rejected with unexpected-id', async () => {
    const { getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#112233' },
                },
            },
        },
    });

    const result = await registerProposalsInActiveChat('chat-1', [
        { id: 'c3', name: 'Bob', color: '#445566' },
    ]);

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-1',
        errors: ['unexpected-id'],
    });
    assert.equal(getSaveCalls(), 0);
});

test('12. existing ID conflict -> rejected', async () => {
    const { getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#112233' },
                },
            },
        },
    });

    const result = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: 'Bob', color: '#445566' },
    ]);

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-1',
        errors: ['id-already-assigned'],
    });
    assert.equal(getSaveCalls(), 0);
});

test('13. existing name conflict -> rejected', async () => {
    const { getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Catherine', color: '#112233' },
                },
            },
        },
    });

    const result = await registerProposalsInActiveChat('chat-1', [
        { id: 'c2', name: 'catherine', color: '#445566' },
    ]);

    assert.deepEqual(result, {
        status: 'rejected',
        chatId: 'chat-1',
        errors: ['name-already-assigned'],
    });
    assert.equal(getSaveCalls(), 0);
});

test('14. rejection performs no metadata save', async () => {
    const { context, getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: 'Alice', color: 'invalid-color' },
    ]);

    assert.equal(getSaveCalls(), 0);
    assert.equal(Object.hasOwn(context.chatMetadata, CHAT_METADATA_KEY), false);
});

test('15. candidate state does not mutate original state', async () => {
    const originalAssignments = {
        c1: { name: 'Alice', color: '#112233' },
    };
    const metadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: originalAssignments,
        },
    };
    setMockContext({
        chatId: 'chat-1',
        metadata,
    });

    await registerProposalsInActiveChat('chat-1', [
        { id: 'c2', name: 'Bob', color: '#445566' },
    ]);

    assert.deepEqual(originalAssignments, {
        c1: { name: 'Alice', color: '#112233' },
    });
});

test('16. source proposal objects are not mutated', async () => {
    setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    const proposal = { id: 'c1', name: '  Alice  ', color: ' #abcdef ' };
    const proposals = [proposal];

    await registerProposalsInActiveChat('chat-1', proposals);

    assert.equal(proposal.name, '  Alice  ');
    assert.equal(proposal.color, ' #abcdef ');
});

test('17. added result data is detached', async () => {
    setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    const proposals = [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.equal(result.status, 'saved');
    assert.notStrictEqual(result.added[0], proposals[0]);

    result.added[0].name = 'Mutated';
    assert.equal(proposals[0].name, 'Alice');
    assert.equal(result.state.assignments.c1.name, 'Alice');
});

test('18. returned saved state is detached', async () => {
    const { context } = setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    const proposals = [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.equal(result.status, 'saved');
    result.state.assignments.c1.name = 'Changed';

    assert.equal(
        context.chatMetadata[CHAT_METADATA_KEY].assignments.c1.name,
        'Alice',
    );
});

test('19. returned no-op state is detached', async () => {
    const { context } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#112233' },
                },
            },
        },
    });

    const result = await registerProposalsInActiveChat('chat-1', []);

    assert.equal(result.status, 'no-op');
    result.state.assignments.c1.name = 'Changed';

    assert.equal(
        context.chatMetadata[CHAT_METADATA_KEY].assignments.c1.name,
        'Alice',
    );
});

test('20. saveActiveChatState() returning no-chat is propagated', async () => {
    let callCount = 0;
    const activeContext = {
        chatId: 'chat-1',
        chatMetadata: {},
        async saveMetadata() {},
    };

    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            if (callCount > 1) {
                return {
                    chatId: null,
                    chatMetadata: {},
                };
            }
            return activeContext;
        },
    };

    const result = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ]);

    assert.deepEqual(result, {
        status: 'no-chat',
        chatId: null,
    });
});

test('21. saveActiveChatState() returning chat-changed is propagated', async () => {
    let callCount = 0;
    const activeContext = {
        chatId: 'chat-1',
        chatMetadata: {},
        async saveMetadata() {},
    };

    globalThis.SillyTavern = {
        getContext() {
            callCount += 1;
            if (callCount > 1) {
                return {
                    chatId: 'chat-2',
                    chatMetadata: {},
                };
            }
            return activeContext;
        },
    };

    const result = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ]);

    assert.deepEqual(result, {
        status: 'chat-changed',
        chatId: 'chat-2',
    });
});

test('22. unexpected save invalid-state maps to service invalid-state', async () => {
    setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    const result = await registerProposalsInActiveChat(
        'chat-1',
        [{ id: 'c1', name: 'Alice', color: '#112233' }],
        {
            saveActiveChatState: async () => ({
                status: 'invalid-state',
                chatId: 'chat-1',
            }),
        },
    );

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-1',
    });
});

test('23. persistence exception rejects the service Promise', async () => {
    setMockContext({
        chatId: 'chat-1',
        metadata: {},
        async onSave() {
            throw new Error('Disk write failed');
        },
    });

    await assert.rejects(
        registerProposalsInActiveChat('chat-1', [
            { id: 'c1', name: 'Alice', color: '#112233' },
        ]),
        /Disk write failed/,
    );
});

test('24. failed persistence does not leave new assignments in metadata, relying on existing chat-store rollback behavior', async () => {
    const metadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {
                c1: { name: 'Alice', color: '#112233' },
            },
        },
    };

    const { context } = setMockContext({
        chatId: 'chat-1',
        metadata,
        async onSave() {
            throw new Error('Network failure');
        },
    });

    await assert.rejects(
        registerProposalsInActiveChat('chat-1', [
            { id: 'c2', name: 'Bob', color: '#222222' },
        ]),
        /Network failure/,
    );

    assert.deepEqual(context.chatMetadata[CHAT_METADATA_KEY], {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
        },
    });
});

test('25. every call reads fresh active-chat state rather than caching it', async () => {
    const metadata = {
        [CHAT_METADATA_KEY]: {
            schemaVersion: 1,
            assignments: {},
        },
    };
    const { context } = setMockContext({
        chatId: 'chat-1',
        metadata,
    });

    const res1 = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ]);
    assert.equal(res1.status, 'saved');

    context.chatMetadata[CHAT_METADATA_KEY] = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
            c2: { name: 'External', color: '#555555' },
        },
    };

    const res2 = await registerProposalsInActiveChat('chat-1', [
        { id: 'c3', name: 'Charlie', color: '#333333' },
    ]);
    assert.equal(res2.status, 'saved');
    assert.equal(res2.state.assignments.c2.name, 'External');
    assert.equal(res2.state.assignments.c3.name, 'Charlie');
});

test('26. a second call after the first successful registration validates against the updated registry', async () => {
    setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    const firstResult = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: 'Catherine', color: '#56B4E9' },
    ]);
    assert.equal(firstResult.status, 'saved');

    const conflictResult = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: 'Mara', color: '#B86FD4' },
    ]);
    assert.deepEqual(conflictResult, {
        status: 'rejected',
        chatId: 'chat-1',
        errors: ['id-already-assigned'],
    });

    const successResult = await registerProposalsInActiveChat('chat-1', [
        { id: 'c2', name: 'Mara', color: '#B86FD4' },
    ]);
    assert.equal(successResult.status, 'saved');
    assert.equal(successResult.state.assignments.c1.name, 'Catherine');
    assert.equal(successResult.state.assignments.c2.name, 'Mara');
});

test('27. the service does not access or mutate unrelated chat metadata keys', async () => {
    const unrelatedData = { userSetting: true, tokenCount: 42 };
    const { context } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            unrelated: unrelatedData,
        },
    });

    await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ]);

    assert.deepEqual(context.chatMetadata.unrelated, unrelatedData);
});

test('28. result errors are detached from validator-owned arrays', async () => {
    setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    const result = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: '', color: '#112233' },
    ]);

    assert.equal(result.status, 'rejected');
    result.errors.push('injected');

    const result2 = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: '', color: '#112233' },
    ]);

    assert.deepEqual(result2.errors, ['invalid-proposals']);
});

test('29. the function returns a Promise', async () => {
    setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    const promise = registerProposalsInActiveChat('chat-1', []);
    assert.ok(promise instanceof Promise);
    const result = await promise;
    assert.equal(result.status, 'no-op');
});

test('30. no direct panel/DOM behavior is involved', async () => {
    setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.window, 'undefined');

    const result = await registerProposalsInActiveChat('chat-1', [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ]);

    assert.equal(result.status, 'saved');
});

test('31. malformed stored assignment dropped by tolerant read cannot be overwritten, returns invalid-state', async () => {
    const rawStored = {
        schemaVersion: 1,
        assignments: {
            c1: { name: '', color: '#112233' },
        },
    };
    const { context, getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: rawStored,
        },
    });

    const proposals = [
        { id: 'c1', name: 'Alice', color: '#445566' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-1',
    });
    assert.equal(getSaveCalls(), 0);
    assert.strictEqual(context.chatMetadata[CHAT_METADATA_KEY], rawStored);
    assert.deepEqual(context.chatMetadata[CHAT_METADATA_KEY], {
        schemaVersion: 1,
        assignments: {
            c1: { name: '', color: '#112233' },
        },
    });
});

test('32. malformed raw entry alongside a valid assignment still blocks persistence', async () => {
    const rawStored = {
        schemaVersion: 1,
        assignments: {
            c1: { name: 'Alice', color: '#112233' },
            c2: { name: 'Bob', color: 'invalid-color' },
        },
    };
    const { context, getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: rawStored,
        },
    });

    const proposals = [
        { id: 'c2', name: 'Charlie', color: '#667788' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-1',
    });
    assert.equal(getSaveCalls(), 0);
    assert.strictEqual(context.chatMetadata[CHAT_METADATA_KEY], rawStored);
});

test('33. raw malformed metadata remains unchanged and saveMetadata is never called for unsafe source', async () => {
    const rawStored = {
        schemaVersion: 1,
        assignments: {
            c100: { name: 'OutOfRange', color: '#112233' },
        },
    };
    const { context, getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: rawStored,
        },
    });

    const proposals = [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.deepEqual(result, {
        status: 'invalid-state',
        chatId: 'chat-1',
    });
    assert.equal(getSaveCalls(), 0);
    assert.strictEqual(context.chatMetadata[CHAT_METADATA_KEY], rawStored);
    assert.deepEqual(context.chatMetadata[CHAT_METADATA_KEY], {
        schemaVersion: 1,
        assignments: {
            c100: { name: 'OutOfRange', color: '#112233' },
        },
    });
});

test('34. valid existing state still registers normally', async () => {
    const { context, getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 1,
                assignments: {
                    c1: { name: 'Alice', color: '#112233' },
                },
            },
        },
    });

    const proposals = [
        { id: 'c2', name: 'Bob', color: '#445566' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.equal(result.status, 'saved');
    assert.equal(getSaveCalls(), 1);
    assert.deepEqual(result.state.assignments, {
        c1: { name: 'Alice', color: '#112233' },
        c2: { name: 'Bob', color: '#445566' },
    });
    assert.deepEqual(context.chatMetadata[CHAT_METADATA_KEY].assignments, {
        c1: { name: 'Alice', color: '#112233' },
        c2: { name: 'Bob', color: '#445566' },
    });
});

test('35. missing Chromatic Dialogue key still registers normally', async () => {
    const { context, getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {},
    });

    const proposals = [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.equal(result.status, 'saved');
    assert.equal(getSaveCalls(), 1);
    assert.deepEqual(context.chatMetadata[CHAT_METADATA_KEY].assignments, {
        c1: { name: 'Alice', color: '#112233' },
    });
});

test('36. unsupported schema still returns unsupported-schema before persistence', async () => {
    const { getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: {
                schemaVersion: 99,
                assignments: {},
            },
        },
    });

    const proposals = [
        { id: 'c1', name: 'Alice', color: '#112233' },
    ];

    const result = await registerProposalsInActiveChat('chat-1', proposals);

    assert.deepEqual(result, {
        status: 'unsupported-schema',
        chatId: 'chat-1',
    });
    assert.equal(getSaveCalls(), 0);
});

test('37. empty proposals with malformed existing state preserve existing no-op behavior and perform no write', async () => {
    const rawStored = {
        schemaVersion: 1,
        assignments: {
            c1: { name: '', color: '#112233' },
        },
    };
    const { context, getSaveCalls } = setMockContext({
        chatId: 'chat-1',
        metadata: {
            [CHAT_METADATA_KEY]: rawStored,
        },
    });

    const result = await registerProposalsInActiveChat('chat-1', []);

    assert.deepEqual(result, {
        status: 'no-op',
        chatId: 'chat-1',
        state: {
            schemaVersion: 1,
            assignments: {},
        },
        added: [],
    });
    assert.equal(getSaveCalls(), 0);
    assert.strictEqual(context.chatMetadata[CHAT_METADATA_KEY], rawStored);
});