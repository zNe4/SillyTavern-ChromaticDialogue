import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    putPendingReview,
    getPendingReview,
    clearAllPendingReviews,
} from '../src/pending-review-store.js';
import { dismissPendingReview } from '../src/review-dismissal-service.js';

function createValidReview(overrides = {}) {
    return {
        chatId: 'chat-a',
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

function createValidSnapshot(overrides = {}) {
    return {
        chatId: 'chat-a',
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

beforeEach(() => {
    clearAllPendingReviews();
});

test('1. null snapshot -> invalid-review', () => {
    assert.deepEqual(dismissPendingReview(null), { status: 'invalid-review' });
});

test('2. array snapshot -> invalid-review', () => {
    assert.deepEqual(dismissPendingReview([]), { status: 'invalid-review' });
});

test('3. primitive snapshot -> invalid-review', () => {
    assert.deepEqual(dismissPendingReview(undefined), { status: 'invalid-review' });
    assert.deepEqual(dismissPendingReview('chat-a'), { status: 'invalid-review' });
    assert.deepEqual(dismissPendingReview(123), { status: 'invalid-review' });
    assert.deepEqual(dismissPendingReview(true), { status: 'invalid-review' });
    assert.deepEqual(dismissPendingReview(Symbol('snap')), { status: 'invalid-review' });
});

test('4. missing chatId -> invalid-review', () => {
    const snapshot = createValidSnapshot();
    delete snapshot.chatId;
    assert.deepEqual(dismissPendingReview(snapshot), { status: 'invalid-review' });
});

test('5. empty chatId -> invalid-review', () => {
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ chatId: '' })),
        { status: 'invalid-review' },
    );
});

test('6. padded chatId -> invalid-review', () => {
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ chatId: ' chat-a' })),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ chatId: 'chat-a ' })),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ chatId: '   ' })),
        { status: 'invalid-review' },
    );
});

test('7. missing messageId -> invalid-review', () => {
    const snapshot = createValidSnapshot();
    delete snapshot.messageId;
    assert.deepEqual(dismissPendingReview(snapshot), { status: 'invalid-review' });
});

test('8. numeric-string messageId -> invalid-review', () => {
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ messageId: '0' })),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ messageId: '12' })),
        { status: 'invalid-review' },
    );
});

test('9. negative messageId -> invalid-review', () => {
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ messageId: -1 })),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ messageId: -0 })),
        { status: 'invalid-review' },
    );
});

test('10. unsafe/floating messageId -> invalid-review', () => {
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ messageId: 1.5 })),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ messageId: NaN })),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ messageId: Infinity })),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ messageId: Number.MAX_SAFE_INTEGER + 1 })),
        { status: 'invalid-review' },
    );
});

test('11. missing proposals -> invalid-review', () => {
    const snapshot = createValidSnapshot();
    delete snapshot.proposals;
    assert.deepEqual(dismissPendingReview(snapshot), { status: 'invalid-review' });
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ proposals: null })),
        { status: 'invalid-review' },
    );
});

test('12. empty proposals -> invalid-review', () => {
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ proposals: [] })),
        { status: 'invalid-review' },
    );
});

test('13. malformed proposal identity -> invalid-review', () => {
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ proposals: [null] })),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(createValidSnapshot({ proposals: ['c1'] })),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(
            createValidSnapshot({
                proposals: [{ id: '', name: 'Alice', proposedColor: '#56B4E9' }],
            }),
        ),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(
            createValidSnapshot({
                proposals: [{ id: 'c1', name: '', proposedColor: '#56B4E9' }],
            }),
        ),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(
            createValidSnapshot({
                proposals: [{ id: 'c1', name: 'Alice', proposedColor: '' }],
            }),
        ),
        { status: 'invalid-review' },
    );
    assert.deepEqual(
        dismissPendingReview(
            createValidSnapshot({
                proposals: [{ id: 1, name: 'Alice', proposedColor: '#56B4E9' }],
            }),
        ),
        { status: 'invalid-review' },
    );
});

test('14. valid snapshot but no current pending -> no-pending', () => {
    const snapshot = createValidSnapshot({ chatId: 'chat-x', messageId: 99 });
    const result = dismissPendingReview(snapshot);

    assert.deepEqual(result, {
        status: 'no-pending',
        chatId: 'chat-x',
        messageId: 99,
    });
});

test('15. exact single-proposal match -> dismissed', () => {
    putPendingReview(createValidReview());
    const snapshot = createValidSnapshot();

    const result = dismissPendingReview(snapshot);

    assert.deepEqual(result, {
        status: 'dismissed',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('16. exact multi-proposal match -> dismissed', () => {
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
    putPendingReview(review);

    const snapshot = createValidSnapshot({
        proposals: [
            {
                id: 'c1',
                name: 'Alice',
                proposedColor: '#56B4E9',
            },
            {
                id: 'c2',
                name: 'Bob',
                proposedColor: '#B86FD4',
            },
        ],
    });

    const result = dismissPendingReview(snapshot);

    assert.deepEqual(result, {
        status: 'dismissed',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('17. dismissal actually removes pending record', () => {
    putPendingReview(createValidReview());

    assert.notStrictEqual(getPendingReview('chat-a', 0), null);
    const result = dismissPendingReview(createValidSnapshot());

    assert.equal(result.status, 'dismissed');
    assert.strictEqual(getPendingReview('chat-a', 0), null);
});

test('18. changed ID -> stale-review', () => {
    putPendingReview(createValidReview());

    const snapshot = createValidSnapshot({
        proposals: [
            {
                id: 'c2',
                name: 'Alice',
                proposedColor: '#56B4E9',
            },
        ],
    });

    const result = dismissPendingReview(snapshot);

    assert.deepEqual(result, {
        status: 'stale-review',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('19. changed name -> stale-review', () => {
    putPendingReview(createValidReview());

    const snapshot = createValidSnapshot({
        proposals: [
            {
                id: 'c1',
                name: 'Bob',
                proposedColor: '#56B4E9',
            },
        ],
    });

    const result = dismissPendingReview(snapshot);

    assert.deepEqual(result, {
        status: 'stale-review',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('20. changed proposedColor -> stale-review', () => {
    putPendingReview(createValidReview());

    const snapshot = createValidSnapshot({
        proposals: [
            {
                id: 'c1',
                name: 'Alice',
                proposedColor: '#B86FD4',
            },
        ],
    });

    const result = dismissPendingReview(snapshot);

    assert.deepEqual(result, {
        status: 'stale-review',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('21. changed proposal count -> stale-review', () => {
    putPendingReview(createValidReview());

    const snapshot = createValidSnapshot({
        proposals: [
            {
                id: 'c1',
                name: 'Alice',
                proposedColor: '#56B4E9',
            },
            {
                id: 'c2',
                name: 'Bob',
                proposedColor: '#B86FD4',
            },
        ],
    });

    const result = dismissPendingReview(snapshot);

    assert.deepEqual(result, {
        status: 'stale-review',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('22. reordered proposals -> stale-review', () => {
    putPendingReview(
        createValidReview({
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
    );

    const snapshot = createValidSnapshot({
        proposals: [
            {
                id: 'c2',
                name: 'Bob',
                proposedColor: '#B86FD4',
            },
            {
                id: 'c1',
                name: 'Alice',
                proposedColor: '#56B4E9',
            },
        ],
    });

    const result = dismissPendingReview(snapshot);

    assert.deepEqual(result, {
        status: 'stale-review',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('23. stale review does not remove current record', () => {
    putPendingReview(createValidReview());

    const snapshot = createValidSnapshot({
        proposals: [
            {
                id: 'c1',
                name: 'Bob',
                proposedColor: '#B86FD4',
            },
        ],
    });

    const result = dismissPendingReview(snapshot);
    assert.equal(result.status, 'stale-review');

    const stored = getPendingReview('chat-a', 0);
    assert.notStrictEqual(stored, null);
    assert.equal(stored.proposals[0].name, 'Alice');
});

test('24. same source but different final color still dismisses', () => {
    putPendingReview(
        createValidReview({
            proposals: [
                {
                    id: 'c1',
                    name: 'Alice',
                    proposedColor: '#56B4E9',
                    color: '#111111',
                    colorAdjusted: true,
                    contrastRatio: 7.1,
                },
            ],
        }),
    );

    const snapshot = createValidSnapshot({
        proposals: [
            {
                id: 'c1',
                name: 'Alice',
                proposedColor: '#56B4E9',
                color: '#999999',
                colorAdjusted: false,
                contrastRatio: 4.5,
            },
        ],
    });

    const result = dismissPendingReview(snapshot);
    assert.equal(result.status, 'dismissed');
    assert.strictEqual(getPendingReview('chat-a', 0), null);
});

test('25. same source but different colorAdjusted still dismisses', () => {
    putPendingReview(
        createValidReview({
            proposals: [
                {
                    id: 'c1',
                    name: 'Alice',
                    proposedColor: '#56B4E9',
                    color: '#56B4E9',
                    colorAdjusted: true,
                    contrastRatio: 4.5,
                },
            ],
        }),
    );

    const snapshot = createValidSnapshot({
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
    });

    const result = dismissPendingReview(snapshot);
    assert.equal(result.status, 'dismissed');
});

test('26. same source but different contrastRatio still dismisses', () => {
    putPendingReview(
        createValidReview({
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
    );

    const snapshot = createValidSnapshot({
        proposals: [
            {
                id: 'c1',
                name: 'Alice',
                proposedColor: '#56B4E9',
                color: '#56B4E9',
                colorAdjusted: false,
                contrastRatio: 12.8,
            },
        ],
    });

    const result = dismissPendingReview(snapshot);
    assert.equal(result.status, 'dismissed');
});

test('27. different chat with same messageId is unaffected', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 5 }));
    putPendingReview(createValidReview({ chatId: 'chat-2', messageId: 5 }));

    const result = dismissPendingReview(
        createValidSnapshot({ chatId: 'chat-1', messageId: 5 }),
    );

    assert.equal(result.status, 'dismissed');
    assert.strictEqual(getPendingReview('chat-1', 5), null);
    assert.notStrictEqual(getPendingReview('chat-2', 5), null);
});

test('28. different message in same chat is unaffected', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 2 }));

    const result = dismissPendingReview(
        createValidSnapshot({ chatId: 'chat-1', messageId: 1 }),
    );

    assert.equal(result.status, 'dismissed');
    assert.strictEqual(getPendingReview('chat-1', 1), null);
    assert.notStrictEqual(getPendingReview('chat-1', 2), null);
});

test('29. input snapshot is not mutated', () => {
    putPendingReview(createValidReview());

    const snapshot = createValidSnapshot();
    const originalJson = JSON.stringify(snapshot);

    dismissPendingReview(snapshot);

    assert.equal(JSON.stringify(snapshot), originalJson);
});

test('30. store-returned object is not mutated', () => {
    putPendingReview(createValidReview());

    const storedBefore = getPendingReview('chat-a', 0);
    const beforeJson = JSON.stringify(storedBefore);

    const staleSnapshot = createValidSnapshot({
        proposals: [
            {
                id: 'c1',
                name: 'TamperedName',
                proposedColor: '#56B4E9',
            },
        ],
    });

    dismissPendingReview(staleSnapshot);

    const storedAfter = getPendingReview('chat-a', 0);
    assert.equal(JSON.stringify(storedAfter), beforeJson);
});

test('31. function is synchronous', () => {
    putPendingReview(createValidReview());

    const result = dismissPendingReview(createValidSnapshot());

    assert.strictEqual(result instanceof Promise, false);
    assert.strictEqual(typeof result?.then, 'undefined');
    assert.equal(result.status, 'dismissed');
});

test('32. no SillyTavern dependency', () => {
    assert.strictEqual(typeof globalThis.SillyTavern, 'undefined');

    putPendingReview(createValidReview());
    const result = dismissPendingReview(createValidSnapshot());
    assert.equal(result.status, 'dismissed');
});

test('33. no DOM dependency', () => {
    assert.strictEqual(typeof globalThis.window, 'undefined');
    assert.strictEqual(typeof globalThis.document, 'undefined');

    putPendingReview(createValidReview());
    const result = dismissPendingReview(createValidSnapshot());
    assert.equal(result.status, 'dismissed');
});

test('34. no persistence API use', () => {
    assert.strictEqual(typeof globalThis.localStorage, 'undefined');
    assert.strictEqual(typeof globalThis.sessionStorage, 'undefined');
    assert.strictEqual(typeof globalThis.indexedDB, 'undefined');

    putPendingReview(createValidReview());
    const result = dismissPendingReview(createValidSnapshot());
    assert.equal(result.status, 'dismissed');
});

test('35. successful removal calls removal only once', () => {
    putPendingReview(createValidReview());

    let removeCalls = 0;
    const result = dismissPendingReview(createValidSnapshot(), {
        removePendingReview: (c, m) => {
            removeCalls++;
            return clearAllPendingReviews() > 0;
        },
    });

    assert.equal(result.status, 'dismissed');
    assert.equal(removeCalls, 1);
});

test('36. unexpected remove=false maps to no-pending', () => {
    putPendingReview(createValidReview());

    const result = dismissPendingReview(createValidSnapshot(), {
        removePendingReview: () => false,
    });

    assert.deepEqual(result, {
        status: 'no-pending',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('37. repeated dismissal: first dismissed, second no-pending', () => {
    putPendingReview(createValidReview());
    const snapshot = createValidSnapshot();

    const first = dismissPendingReview(snapshot);
    assert.deepEqual(first, {
        status: 'dismissed',
        chatId: 'chat-a',
        messageId: 0,
    });

    const second = dismissPendingReview(snapshot);
    assert.deepEqual(second, {
        status: 'no-pending',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('38. null-prototype snapshot may be handled safely if identity shape is valid', () => {
    putPendingReview(createValidReview());

    const snapshot = Object.create(null);
    snapshot.chatId = 'chat-a';
    snapshot.messageId = 0;

    const prop = Object.create(null);
    prop.id = 'c1';
    prop.name = 'Alice';
    prop.proposedColor = '#56B4E9';
    snapshot.proposals = [prop];

    const result = dismissPendingReview(snapshot);
    assert.deepEqual(result, {
        status: 'dismissed',
        chatId: 'chat-a',
        messageId: 0,
    });
});

test('39. class/custom-prototype snapshot must not cause exceptions', () => {
    class CustomSnapshot {
        constructor() {
            this.chatId = 'chat-a';
            this.messageId = 0;
            this.proposals = [
                {
                    id: 'c1',
                    name: 'Alice',
                    proposedColor: '#56B4E9',
                },
            ];
        }
    }

    class ExplodingSnapshot {
        get chatId() {
            throw new Error('Explosion');
        }
    }

    assert.doesNotThrow(() => {
        putPendingReview(createValidReview());
        const res = dismissPendingReview(new CustomSnapshot());
        assert.equal(res.status, 'dismissed');
    });

    assert.doesNotThrow(() => {
        const res = dismissPendingReview(new ExplodingSnapshot());
        assert.equal(res.status, 'invalid-review');
    });
});

test('40. theme-derived field changes alone do not make a review stale', () => {
    putPendingReview(
        createValidReview({
            proposals: [
                {
                    id: 'c1',
                    name: 'Alice',
                    proposedColor: '#777777',
                    color: '#333333',
                    colorAdjusted: true,
                    contrastRatio: 6.8,
                },
            ],
        }),
    );

    const snapshot = createValidSnapshot({
        proposals: [
            {
                id: 'c1',
                name: 'Alice',
                proposedColor: '#777777',
                color: '#EEEEEE',
                colorAdjusted: true,
                contrastRatio: 5.1,
            },
        ],
    });

    const result = dismissPendingReview(snapshot);

    assert.deepEqual(result, {
        status: 'dismissed',
        chatId: 'chat-a',
        messageId: 0,
    });
    assert.strictEqual(getPendingReview('chat-a', 0), null);
});