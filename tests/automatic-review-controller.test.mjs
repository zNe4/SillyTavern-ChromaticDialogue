import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    clearAllPendingReviews,
    getPendingReview,
    putPendingReview,
    removePendingReview,
} from '../src/pending-review-store.js';
import { enqueueAutomaticReview } from '../src/automatic-review-controller.js';

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

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
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

test('1. module import causes no side effects', async () => {
    clearAllPendingReviews();
    assert.strictEqual(getPendingReview('chat-1', 0), null);
});

test('2. valid enqueue stores pending immediately', () => {
    const review = createValidReview();
    const promise = enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    const stored = getPendingReview('chat-1', 0);
    assert.notStrictEqual(stored, null);
    assert.strictEqual(stored.chatId, 'chat-1');
    assert.strictEqual(stored.messageId, 0);
    assert.strictEqual(stored.proposals[0].name, 'Alice');

    return promise;
});

test('3. caller review mutation after enqueue cannot alter queued snapshot', async () => {
    const review = createValidReview();
    let approvalSnapshotChatId = null;
    let approvalSnapshotMessageId = null;

    const promise = enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async (cid, mid) => {
            approvalSnapshotChatId = cid;
            approvalSnapshotMessageId = mid;
            return { status: 'approved' };
        },
    });

    review.proposals[0].name = 'MutatedName';
    review.proposals[0].proposedColor = '#000000';

    const res = await promise;
    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(approvalSnapshotChatId, 'chat-1');
    assert.strictEqual(approvalSnapshotMessageId, 0);

    const stored = getPendingReview('chat-1', 0);
    assert.strictEqual(stored.proposals[0].name, 'Alice');
    assert.strictEqual(stored.proposals[0].proposedColor, '#56B4E9');
});

test('4. invalid review returns invalid-review', async () => {
    const badReviews = [
        null,
        undefined,
        {},
        { chatId: 'chat-1' },
        { chatId: '', messageId: 0, proposals: [] },
        { chatId: 'chat-1', messageId: -1, proposals: [] },
    ];

    for (const bad of badReviews) {
        const res = await enqueueAutomaticReview(bad);
        assert.deepEqual(res, { status: 'invalid-review' });
    }
});

test('5. invalid review does not enter approval queue', async () => {
    let modeCalled = false;
    let approvalCalled = false;

    const res = await enqueueAutomaticReview({ invalid: true }, {
        readActiveChatMode: () => {
            modeCalled = true;
            return { status: 'ready', chatId: 'chat-1', mode: 'automatic' };
        },
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(res, { status: 'invalid-review' });
    assert.strictEqual(modeCalled, false);
    assert.strictEqual(approvalCalled, false);
});

test('6. first valid job calls fresh readActiveChatMode at job start', async () => {
    let modeCalls = 0;
    const review = createValidReview();

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => {
            modeCalls += 1;
            return { status: 'ready', chatId: 'chat-1', mode: 'automatic' };
        },
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(modeCalls, 1);
});

test('7. mode Review at job start skips automatic approval', async () => {
    let approvalCalled = false;
    const review = createValidReview();

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'review' }),
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(res, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'mode-changed',
    });
    assert.strictEqual(approvalCalled, false);
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('8. mode Off at job start skips automatic approval', async () => {
    let approvalCalled = false;
    const review = createValidReview();

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'off' }),
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(res, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'mode-changed',
    });
    assert.strictEqual(approvalCalled, false);
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('9. no-chat/non-ready mode skips approval', async () => {
    let approvalCalled = false;
    const review = createValidReview();

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'no-chat', chatId: null, mode: null }),
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(res, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'chat-changed',
    });
    assert.strictEqual(approvalCalled, false);
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('10. wrong active chat skips approval', async () => {
    let approvalCalled = false;
    const review = createValidReview();

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-2', mode: 'automatic' }),
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(res, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'chat-changed',
    });
    assert.strictEqual(approvalCalled, false);
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('11. strict chat identity comparison is used', async () => {
    let approvalCalled = false;
    const review = createValidReview({ chatId: '123' });

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 123, mode: 'automatic' }),
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(res, {
        status: 'skipped',
        chatId: '123',
        messageId: 0,
        reason: 'chat-changed',
    });
    assert.strictEqual(approvalCalled, false);
});

test('12. Automatic + matching chat proceeds', async () => {
    let approvalCalled = false;
    const review = createValidReview();

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(approvalCalled, true);
});

test('13. pending missing before job starts skips approval', async () => {
    let approvalCalled = false;
    const review = createValidReview();

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        getPendingReview: () => null,
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(res, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'pending-missing',
    });
    assert.strictEqual(approvalCalled, false);
});

test('14. pending replacement by different name skips old job', async () => {
    let approvalCalled = false;
    const review = createValidReview();

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        getPendingReview: () => createValidReview({
            proposals: [{
                id: 'c1',
                name: 'Bob',
                proposedColor: '#56B4E9',
                color: '#56B4E9',
                colorAdjusted: false,
                contrastRatio: 4.5,
            }],
        }),
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(res, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'pending-replaced',
    });
    assert.strictEqual(approvalCalled, false);
});

test('15. pending replacement by different proposedColor skips old job', async () => {
    let approvalCalled = false;
    const review = createValidReview();

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        getPendingReview: () => createValidReview({
            proposals: [{
                id: 'c1',
                name: 'Alice',
                proposedColor: '#B86FD4',
                color: '#B86FD4',
                colorAdjusted: false,
                contrastRatio: 4.5,
            }],
        }),
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(res, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'pending-replaced',
    });
    assert.strictEqual(approvalCalled, false);
});

test('16. pending replacement by different proposal order skips old job', async () => {
    let approvalCalled = false;
    const review = createValidReview({
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
    });

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        getPendingReview: () => createValidReview({
            proposals: [
                {
                    id: 'c2',
                    name: 'Bob',
                    proposedColor: '#B86FD4',
                    color: '#B86FD4',
                    colorAdjusted: false,
                    contrastRatio: 5.2,
                },
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
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(res, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'pending-replaced',
    });
    assert.strictEqual(approvalCalled, false);
});

test('17. pending replacement by different proposal count skips old job', async () => {
    let approvalCalled = false;
    const review = createValidReview();

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        getPendingReview: () => createValidReview({
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
        }),
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(res, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'pending-replaced',
    });
    assert.strictEqual(approvalCalled, false);
});

test('18. exact matching snapshot proceeds', async () => {
    let approvalCalled = false;
    const review = createValidReview();

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        getPendingReview: () => createValidReview({
            proposals: [{
                id: 'c1',
                name: 'Alice',
                proposedColor: '#56B4E9',
                color: '#111111',
                colorAdjusted: true,
                contrastRatio: 7.0,
            }],
        }),
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(approvalCalled, true);
});

test('19. approvePendingReview receives exactly chatId + messageId', async () => {
    let receivedArgs = null;
    const review = createValidReview({ chatId: 'chat-custom', messageId: 42 });

    await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-custom', mode: 'automatic' }),
        approvePendingReview: async (...args) => {
            receivedArgs = args;
            return { status: 'approved' };
        },
    });

    assert.deepEqual(receivedArgs, ['chat-custom', 42]);
});

test('20. approved result maps to controller approved', async () => {
    const review = createValidReview();
    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    assert.deepEqual(res, {
        status: 'approved',
        chatId: 'chat-1',
        messageId: 0,
    });
});

test('21. already-applied maps to controller already-applied', async () => {
    const review = createValidReview();
    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({ status: 'already-applied' }),
    });

    assert.deepEqual(res, {
        status: 'already-applied',
        chatId: 'chat-1',
        messageId: 0,
    });
});

test('22. controller itself never removes pending review', async () => {
    const review = createValidReview();
    let storeRemoveCalled = false;

    await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'review' }),
        removePendingReview: () => {
            storeRemoveCalled = true;
        },
    });

    assert.strictEqual(storeRemoveCalled, false);
    assert.notStrictEqual(getPendingReview('chat-1', 0), null);
});

test('23. registration-rejected maps to left-pending', async () => {
    const review = createValidReview();
    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({
            status: 'registration-rejected',
            reason: 'registry-rejected',
        }),
    });

    assert.deepEqual(res, {
        status: 'left-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'registration-rejected',
    });
});

test('24. stale-pending maps to left-pending', async () => {
    const review = createValidReview();
    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({
            status: 'stale-pending',
            reason: 'source-changed',
        }),
    });

    assert.deepEqual(res, {
        status: 'left-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'stale-pending',
    });
});

test('25. chat-changed approval result maps to left-pending', async () => {
    const review = createValidReview();
    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({
            status: 'chat-changed',
            currentChatId: 'chat-2',
        }),
    });

    assert.deepEqual(res, {
        status: 'left-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'chat-changed',
    });
});

test('26. runtime-unavailable maps to left-pending', async () => {
    const review = createValidReview();
    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({
            status: 'runtime-unavailable',
            reason: 'dom-unavailable',
        }),
    });

    assert.deepEqual(res, {
        status: 'left-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'runtime-unavailable',
    });
});

test('27. persistence-error maps to left-pending', async () => {
    const review = createValidReview();
    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({
            status: 'persistence-error',
        }),
    });

    assert.deepEqual(res, {
        status: 'left-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'persistence-error',
    });
});

test('28. registration-failed maps to left-pending', async () => {
    const review = createValidReview();
    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({
            status: 'registration-failed',
            reason: 'invalid-state',
        }),
    });

    assert.deepEqual(res, {
        status: 'left-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'registration-failed',
    });
});

test('29. unsupported-schema maps to left-pending', async () => {
    const review = createValidReview();
    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({
            status: 'unsupported-schema',
        }),
    });

    assert.deepEqual(res, {
        status: 'left-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'unsupported-schema',
    });
});

test('30. unexpected approval status maps to left-pending', async () => {
    const review = createValidReview();
    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({
            status: 'some-future-unknown-status',
        }),
    });

    assert.deepEqual(res, {
        status: 'left-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'some-future-unknown-status',
    });
});

test('31. thrown approval error resolves left-pending/approval-error', async () => {
    const review = createValidReview();
    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            throw new Error('Approval service crashed');
        },
    });

    assert.deepEqual(res, {
        status: 'left-pending',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'approval-error',
    });
});

test('32. thrown approval error never rejects public Promise', async () => {
    const review = createValidReview();
    let rejected = false;

    try {
        await enqueueAutomaticReview(review, {
            readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
            approvePendingReview: async () => {
                throw new Error('Explosion');
            },
        });
    } catch {
        rejected = true;
    }

    assert.strictEqual(rejected, false);
});

test('33. failure of one job does not poison later queue job', async () => {
    const review1 = createValidReview({ messageId: 1 });
    const review2 = createValidReview({ messageId: 2 });

    const p1 = enqueueAutomaticReview(review1, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            throw new Error('Job 1 crashed');
        },
    });

    const p2 = enqueueAutomaticReview(review2, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    const res1 = await p1;
    const res2 = await p2;

    assert.strictEqual(res1.status, 'left-pending');
    assert.strictEqual(res1.reason, 'approval-error');
    assert.strictEqual(res2.status, 'approved');
});

test('34. two jobs never execute approvePendingReview concurrently', async () => {
    const deferred1 = createDeferred();
    let job1Running = false;
    let concurrentDetected = false;

    const review1 = createValidReview({ messageId: 1 });
    const review2 = createValidReview({ messageId: 2 });

    const p1 = enqueueAutomaticReview(review1, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            job1Running = true;
            await deferred1.promise;
            job1Running = false;
            return { status: 'approved' };
        },
    });

    const p2 = enqueueAutomaticReview(review2, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            if (job1Running) {
                concurrentDetected = true;
            }
            return { status: 'approved' };
        },
    });

    assert.strictEqual(job1Running, false);
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(job1Running, true);

    deferred1.resolve();
    await Promise.all([p1, p2]);

    assert.strictEqual(concurrentDetected, false);
});

test('35. second approval starts only after first settles', async () => {
    const executionOrder = [];
    const deferred1 = createDeferred();

    const review1 = createValidReview({ messageId: 1 });
    const review2 = createValidReview({ messageId: 2 });

    const p1 = enqueueAutomaticReview(review1, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            executionOrder.push('job1-start');
            await deferred1.promise;
            executionOrder.push('job1-end');
            return { status: 'approved' };
        },
    });

    const p2 = enqueueAutomaticReview(review2, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            executionOrder.push('job2-start');
            return { status: 'approved' };
        },
    });

    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(executionOrder, ['job1-start']);

    deferred1.resolve();
    await Promise.all([p1, p2]);

    assert.deepEqual(executionOrder, ['job1-start', 'job1-end', 'job2-start']);
});

test('36. global serialization also applies across two different chat IDs', async () => {
    const executionOrder = [];
    const deferred1 = createDeferred();

    const review1 = createValidReview({ chatId: 'chat-A', messageId: 1 });
    const review2 = createValidReview({ chatId: 'chat-B', messageId: 1 });

    const p1 = enqueueAutomaticReview(review1, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-A', mode: 'automatic' }),
        approvePendingReview: async () => {
            executionOrder.push('chat-A-start');
            await deferred1.promise;
            executionOrder.push('chat-A-end');
            return { status: 'approved' };
        },
    });

    const p2 = enqueueAutomaticReview(review2, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-B', mode: 'automatic' }),
        approvePendingReview: async () => {
            executionOrder.push('chat-B-start');
            return { status: 'approved' };
        },
    });

    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(executionOrder, ['chat-A-start']);

    deferred1.resolve();
    await Promise.all([p1, p2]);

    assert.deepEqual(executionOrder, ['chat-A-start', 'chat-A-end', 'chat-B-start']);
});

test('37. both reviews are nevertheless stored immediately before serialized approval', () => {
    const deferred1 = createDeferred();

    const review1 = createValidReview({ messageId: 1 });
    const review2 = createValidReview({ messageId: 2, proposals: [{
        id: 'c2',
        name: 'Bob',
        proposedColor: '#B86FD4',
        color: '#B86FD4',
        colorAdjusted: false,
        contrastRatio: 5.0,
    }] });

    const p1 = enqueueAutomaticReview(review1, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            await deferred1.promise;
            return { status: 'approved' };
        },
    });

    const p2 = enqueueAutomaticReview(review2, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    assert.notStrictEqual(getPendingReview('chat-1', 1), null);
    assert.notStrictEqual(getPendingReview('chat-1', 2), null);

    deferred1.resolve();
    return Promise.all([p1, p2]);
});

test('38. mode is fresh-read separately for each queued job', async () => {
    let modeCalls = 0;

    const review1 = createValidReview({ messageId: 1 });
    const review2 = createValidReview({ messageId: 2 });

    const p1 = enqueueAutomaticReview(review1, {
        readActiveChatMode: () => {
            modeCalls += 1;
            return { status: 'ready', chatId: 'chat-1', mode: 'automatic' };
        },
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    const p2 = enqueueAutomaticReview(review2, {
        readActiveChatMode: () => {
            modeCalls += 1;
            return { status: 'ready', chatId: 'chat-1', mode: 'automatic' };
        },
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    await Promise.all([p1, p2]);
    assert.strictEqual(modeCalls, 2);
});

test('39. mode changing Automatic -> Review before second job starts leaves second pending', async () => {
    let activeMode = 'automatic';
    const deferred1 = createDeferred();
    const firstStarted = createDeferred();

    const review1 = createValidReview({ messageId: 1 });
    const review2 = createValidReview({ messageId: 2 });

    const p1 = enqueueAutomaticReview(review1, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: activeMode }),
        approvePendingReview: async () => {
            firstStarted.resolve();
            await deferred1.promise;
            return { status: 'approved' };
        },
    });

    const p2 = enqueueAutomaticReview(review2, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: activeMode }),
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    await firstStarted.promise;

    activeMode = 'review';
    deferred1.resolve();

    const res1 = await p1;
    const res2 = await p2;

    assert.strictEqual(res1.status, 'approved');
    assert.deepEqual(res2, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 2,
        reason: 'mode-changed',
    });
    assert.notStrictEqual(getPendingReview('chat-1', 2), null);
});

test('40. mode changing Automatic -> Off before second job starts leaves second pending', async () => {
    let activeMode = 'automatic';
    const deferred1 = createDeferred();
    const firstStarted = createDeferred();

    const review1 = createValidReview({ messageId: 1 });
    const review2 = createValidReview({ messageId: 2 });

    const p1 = enqueueAutomaticReview(review1, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: activeMode }),
        approvePendingReview: async () => {
            firstStarted.resolve();
            await deferred1.promise;
            return { status: 'approved' };
        },
    });

    const p2 = enqueueAutomaticReview(review2, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: activeMode }),
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    await firstStarted.promise;

    activeMode = 'off';
    deferred1.resolve();

    const res1 = await p1;
    const res2 = await p2;

    assert.strictEqual(res1.status, 'approved');
    assert.deepEqual(res2, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 2,
        reason: 'mode-changed',
    });
    assert.notStrictEqual(getPendingReview('chat-1', 2), null);
});

test('41. active chat changing before second job starts leaves second pending', async () => {
    let currentChat = 'chat-1';
    const deferred1 = createDeferred();
    const firstStarted = createDeferred();

    const review1 = createValidReview({ messageId: 1 });
    const review2 = createValidReview({ messageId: 2 });

    const p1 = enqueueAutomaticReview(review1, {
        readActiveChatMode: () => ({ status: 'ready', chatId: currentChat, mode: 'automatic' }),
        approvePendingReview: async () => {
            firstStarted.resolve();
            await deferred1.promise;
            return { status: 'approved' };
        },
    });

    const p2 = enqueueAutomaticReview(review2, {
        readActiveChatMode: () => ({ status: 'ready', chatId: currentChat, mode: 'automatic' }),
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    await firstStarted.promise;

    currentChat = 'chat-2';
    deferred1.resolve();

    const res1 = await p1;
    const res2 = await p2;

    assert.strictEqual(res1.status, 'approved');
    assert.deepEqual(res2, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 2,
        reason: 'chat-changed',
    });
    assert.notStrictEqual(getPendingReview('chat-1', 2), null);
});

test('42. mode change after approval has already begun does not cancel that in-flight call', async () => {
    let currentMode = 'automatic';
    const deferred = createDeferred();

    const review = createValidReview();
    const promise = enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: currentMode }),
        approvePendingReview: async () => {
            currentMode = 'off';
            await deferred.promise;
            return { status: 'approved' };
        },
    });

    await new Promise((r) => setTimeout(r, 10));
    deferred.resolve();

    const res = await promise;
    assert.strictEqual(res.status, 'approved');
});

test('43. duplicate exact enqueue does not create concurrent approvals', async () => {
    let activeApprovals = 0;
    let maxConcurrency = 0;
    const deferred1 = createDeferred();

    const review = createValidReview();

    const p1 = enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            activeApprovals += 1;
            maxConcurrency = Math.max(maxConcurrency, activeApprovals);
            await deferred1.promise;
            activeApprovals -= 1;
            return { status: 'approved' };
        },
    });

    const p2 = enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            activeApprovals += 1;
            maxConcurrency = Math.max(maxConcurrency, activeApprovals);
            activeApprovals -= 1;
            return { status: 'approved' };
        },
    });

    await new Promise((r) => setTimeout(r, 10));
    deferred1.resolve();

    await Promise.all([p1, p2]);
    assert.strictEqual(maxConcurrency, 1);
});

test('44. duplicate queued job after first removes review skips pending-missing', async () => {
    const review = createValidReview();

    const p1 = enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async (cid, mid) => {
            removePendingReview(cid, mid);
            return { status: 'approved' };
        },
    });

    const p2 = enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    const res1 = await p1;
    const res2 = await p2;

    assert.strictEqual(res1.status, 'approved');
    assert.deepEqual(res2, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 0,
        reason: 'pending-missing',
    });
});

test('45. manual dismiss before job starts prevents automatic approval', async () => {
    let approvalCalled = false;
    const deferred1 = createDeferred();

    const review1 = createValidReview({ messageId: 1 });
    const review2 = createValidReview({ messageId: 2 });

    const p1 = enqueueAutomaticReview(review1, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            await deferred1.promise;
            return { status: 'approved' };
        },
    });

    const p2 = enqueueAutomaticReview(review2, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            approvalCalled = true;
            return { status: 'approved' };
        },
    });

    removePendingReview('chat-1', 2);
    deferred1.resolve();

    const res1 = await p1;
    const res2 = await p2;

    assert.strictEqual(res1.status, 'approved');
    assert.deepEqual(res2, {
        status: 'skipped',
        chatId: 'chat-1',
        messageId: 2,
        reason: 'pending-missing',
    });
    assert.strictEqual(approvalCalled, false);
});

test('46. manual approval/removal before job starts prevents second automatic approval', async () => {
    let approvalCalls = 0;
    const deferred1 = createDeferred();

    const review1 = createValidReview({ messageId: 1 });
    const review2 = createValidReview({ messageId: 2 });

    const p1 = enqueueAutomaticReview(review1, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            await deferred1.promise;
            return { status: 'approved' };
        },
    });

    const p2 = enqueueAutomaticReview(review2, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            approvalCalls += 1;
            return { status: 'approved' };
        },
    });

    removePendingReview('chat-1', 2);
    deferred1.resolve();

    await Promise.all([p1, p2]);
    assert.strictEqual(approvalCalls, 0);
});

test('47. one multi-proposal review causes exactly one approval call', async () => {
    let approvalCalls = 0;
    const review = createValidReview({
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
    });

    const res = await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            approvalCalls += 1;
            return { status: 'approved' };
        },
    });

    assert.strictEqual(res.status, 'approved');
    assert.strictEqual(approvalCalls, 1);
});

test('48. proposal array is not split', async () => {
    let approvedMid = null;
    const review = createValidReview({
        messageId: 88,
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
    });

    await enqueueAutomaticReview(review, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async (cid, mid) => {
            approvedMid = mid;
            return { status: 'approved' };
        },
    });

    assert.strictEqual(approvedMid, 88);
});

test('49. first-success-wins serialization: A completes before conflicting B starts', async () => {
    const log = [];
    const deferredA = createDeferred();

    const reviewA = createValidReview({ messageId: 1, proposals: [{
        id: 'c1',
        name: 'Alice',
        proposedColor: '#56B4E9',
        color: '#56B4E9',
        colorAdjusted: false,
        contrastRatio: 4.5,
    }] });

    const reviewB = createValidReview({ messageId: 2, proposals: [{
        id: 'c1',
        name: 'Bob',
        proposedColor: '#B86FD4',
        color: '#B86FD4',
        colorAdjusted: false,
        contrastRatio: 5.2,
    }] });

    const pA = enqueueAutomaticReview(reviewA, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            log.push('start-A');
            await deferredA.promise;
            log.push('finish-A');
            return { status: 'approved' };
        },
    });

    const pB = enqueueAutomaticReview(reviewB, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            log.push('start-B');
            return { status: 'registration-rejected' };
        },
    });

    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(log, ['start-A']);

    deferredA.resolve();
    await Promise.all([pA, pB]);

    assert.deepEqual(log, ['start-A', 'finish-A', 'start-B']);
});

test('50. conflicting B uses approval service only after A finishes', async () => {
    let aFinished = false;
    let bSawAFinished = false;
    const deferredA = createDeferred();

    const reviewA = createValidReview({ messageId: 1 });
    const reviewB = createValidReview({ messageId: 2 });

    const pA = enqueueAutomaticReview(reviewA, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            await deferredA.promise;
            aFinished = true;
            return { status: 'approved' };
        },
    });

    const pB = enqueueAutomaticReview(reviewB, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => {
            bSawAFinished = aFinished;
            return { status: 'registration-rejected' };
        },
    });

    deferredA.resolve();
    await Promise.all([pA, pB]);

    assert.strictEqual(bSawAFinished, true);
});

test('51. same ID/name second job can accept already-applied reconciliation', async () => {
    const reviewA = createValidReview({ messageId: 1 });
    const reviewB = createValidReview({ messageId: 2 });

    const pA = enqueueAutomaticReview(reviewA, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({ status: 'approved' }),
    });

    const pB = enqueueAutomaticReview(reviewB, {
        readActiveChatMode: () => ({ status: 'ready', chatId: 'chat-1', mode: 'automatic' }),
        approvePendingReview: async () => ({ status: 'already-applied' }),
    });

    const resA = await pA;
    const resB = await pB;

    assert.strictEqual(resA.status, 'approved');
    assert.strictEqual(resB.status, 'already-applied');
});

test('52. controller does not import registration-service', () => {
    const code = fs.readFileSync(new URL('../src/automatic-review-controller.js', import.meta.url), 'utf8');
    assert.strictEqual(code.includes('registration-service'), false);
});

test('53. controller does not import chat-store', () => {
    const code = fs.readFileSync(new URL('../src/automatic-review-controller.js', import.meta.url), 'utf8');
    assert.strictEqual(code.includes('chat-store'), false);
});

test('54. controller does not access saveMetadata', () => {
    const code = fs.readFileSync(new URL('../src/automatic-review-controller.js', import.meta.url), 'utf8');
    assert.strictEqual(code.includes('saveMetadata'), false);
});

test('55. controller does not import listPendingReviews', () => {
    const code = fs.readFileSync(new URL('../src/automatic-review-controller.js', import.meta.url), 'utf8');
    assert.strictEqual(code.includes('listPendingReviews'), false);
});

test('56. controller does not scan old pending cards', () => {
    const code = fs.readFileSync(new URL('../src/automatic-review-controller.js', import.meta.url), 'utf8');
    assert.strictEqual(code.includes('clearAllPendingReviews'), false);
    assert.strictEqual(code.includes('clearPendingReviewsForChat'), false);
});

test('57. controller does not access DOM', () => {
    const code = fs.readFileSync(new URL('../src/automatic-review-controller.js', import.meta.url), 'utf8');
    assert.strictEqual(code.includes('document'), false);
    assert.strictEqual(code.includes('window'), false);
    assert.strictEqual(code.includes('HTMLElement'), false);
});

test('58. controller does not import panel.js', () => {
    const code = fs.readFileSync(new URL('../src/automatic-review-controller.js', import.meta.url), 'utf8');
    assert.strictEqual(code.includes('panel.js'), false);
});

test('59. controller does not refresh styles', () => {
    const code = fs.readFileSync(new URL('../src/automatic-review-controller.js', import.meta.url), 'utf8');
    assert.strictEqual(code.includes('refreshDialogueStyles'), false);
    assert.strictEqual(code.includes('style-sync'), false);
});

test('60. controller does not mutate source messages', () => {
    const code = fs.readFileSync(new URL('../src/automatic-review-controller.js', import.meta.url), 'utf8');
    assert.strictEqual(code.includes('.mes ='), false);
    assert.strictEqual(code.includes('<!-- CD_NEW'), false);
});