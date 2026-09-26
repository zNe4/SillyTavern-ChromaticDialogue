import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    putPendingReview,
    getPendingReview,
    listPendingReviews,
    removePendingReview,
    clearPendingReviewsForChat,
    clearAllPendingReviews,
    getPendingReviewCount,
    subscribePendingReviewChanges,
} from '../src/pending-review-store.js';

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

beforeEach(() => {
    clearAllPendingReviews();
});

test('1. Valid review stores successfully', () => {
    const review = createValidReview();
    const result = putPendingReview(review);

    assert.equal(result.status, 'stored');
    assert.deepEqual(result.review, review);
});

test('2. Stored result is detached', () => {
    const review = createValidReview();
    const result = putPendingReview(review);

    assert.notStrictEqual(result.review, review);
    assert.notStrictEqual(result.review.proposals, review.proposals);
    assert.notStrictEqual(result.review.proposals[0], review.proposals[0]);

    result.review.proposals[0].name = 'Mutated';
    const fetched = getPendingReview('chat-a', 0);
    assert.equal(fetched.proposals[0].name, 'Alice');
});

test('3. getPendingReview retrieves exact record', () => {
    const review = createValidReview({
        chatId: 'chat-x',
        messageId: 42,
        proposals: [
            {
                id: 'c2',
                name: 'Mara',
                proposedColor: '#643274',
                color: '#C37BDD',
                colorAdjusted: true,
                contrastRatio: 4.62,
            },
        ],
    });

    putPendingReview(review);
    const fetched = getPendingReview('chat-x', 42);

    assert.deepEqual(fetched, review);
});

test('4. Missing review returns null', () => {
    assert.strictEqual(getPendingReview('non-existent', 0), null);
});

test('5. Different chats with same messageId do not collide', () => {
    const reviewA = createValidReview({ chatId: 'chat-a', messageId: 10 });
    const reviewB = createValidReview({
        chatId: 'chat-b',
        messageId: 10,
        proposals: [
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

    putPendingReview(reviewA);
    putPendingReview(reviewB);

    assert.equal(getPendingReview('chat-a', 10).proposals[0].name, 'Alice');
    assert.equal(getPendingReview('chat-b', 10).proposals[0].name, 'Bob');
});

test('6. Same chat/message upsert replaces old review', () => {
    const initial = createValidReview();
    putPendingReview(initial);

    const updated = createValidReview({
        proposals: [
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
    const result = putPendingReview(updated);

    assert.equal(result.status, 'stored');
    assert.equal(getPendingReviewCount('chat-a'), 1);
    const fetched = getPendingReview('chat-a', 0);
    assert.equal(fetched.proposals[0].id, 'c2');
    assert.equal(fetched.proposals[0].name, 'Bob');
});

test('7. Invalid replacement leaves existing review unchanged', () => {
    const initial = createValidReview();
    putPendingReview(initial);

    const invalid = createValidReview({
        proposals: [{ id: 'invalid-id' }],
    });
    const result = putPendingReview(invalid);

    assert.equal(result.status, 'invalid-review');
    const fetched = getPendingReview('chat-a', 0);
    assert.equal(fetched.proposals[0].id, 'c1');
    assert.equal(fetched.proposals[0].name, 'Alice');
});

test('8. Null review rejected', () => {
    assert.deepEqual(putPendingReview(null), { status: 'invalid-review' });
});

test('9. Array review rejected', () => {
    assert.deepEqual(putPendingReview([]), { status: 'invalid-review' });
});

test('10. Extra top-level key rejected', () => {
    const review = createValidReview({ extraKey: true });
    assert.deepEqual(putPendingReview(review), { status: 'invalid-review' });
});

test('11. Empty chatId rejected', () => {
    const review = createValidReview({ chatId: '' });
    assert.deepEqual(putPendingReview(review), { status: 'invalid-review' });
});

test('12. Whitespace-padded chatId rejected', () => {
    assert.deepEqual(putPendingReview(createValidReview({ chatId: ' chat-a' })), {
        status: 'invalid-review',
    });
    assert.deepEqual(putPendingReview(createValidReview({ chatId: 'chat-a ' })), {
        status: 'invalid-review',
    });
    assert.deepEqual(putPendingReview(createValidReview({ chatId: '   ' })), {
        status: 'invalid-review',
    });
});

test('13. Numeric messageId required', () => {
    assert.deepEqual(putPendingReview(createValidReview({ messageId: '0' })), {
        status: 'invalid-review',
    });
    assert.deepEqual(putPendingReview(createValidReview({ messageId: '27' })), {
        status: 'invalid-review',
    });
});

test('14. Negative messageId rejected', () => {
    assert.deepEqual(putPendingReview(createValidReview({ messageId: -1 })), {
        status: 'invalid-review',
    });
});

test('15. Unsafe messageId rejected', () => {
    assert.deepEqual(putPendingReview(createValidReview({ messageId: 1.5 })), {
        status: 'invalid-review',
    });
    assert.deepEqual(putPendingReview(createValidReview({ messageId: NaN })), {
        status: 'invalid-review',
    });
    assert.deepEqual(putPendingReview(createValidReview({ messageId: Infinity })), {
        status: 'invalid-review',
    });
    assert.deepEqual(
        putPendingReview(createValidReview({ messageId: Number.MAX_SAFE_INTEGER + 1 })),
        { status: 'invalid-review' },
    );
});

test('16. Empty proposals rejected', () => {
    assert.deepEqual(putPendingReview(createValidReview({ proposals: [] })), {
        status: 'invalid-review',
    });
});

test('17. Non-array proposals rejected', () => {
    assert.deepEqual(putPendingReview(createValidReview({ proposals: {} })), {
        status: 'invalid-review',
    });
    assert.deepEqual(putPendingReview(createValidReview({ proposals: 'c1' })), {
        status: 'invalid-review',
    });
});

test('18. Non-object proposal rejected', () => {
    assert.deepEqual(putPendingReview(createValidReview({ proposals: [null] })), {
        status: 'invalid-review',
    });
    assert.deepEqual(putPendingReview(createValidReview({ proposals: ['c1'] })), {
        status: 'invalid-review',
    });
});

test('19. Extra proposal key rejected', () => {
    const proposal = {
        id: 'c1',
        name: 'Alice',
        proposedColor: '#56B4E9',
        color: '#56B4E9',
        colorAdjusted: false,
        contrastRatio: 4.5,
        extra: 'not-allowed',
    };
    assert.deepEqual(putPendingReview(createValidReview({ proposals: [proposal] })), {
        status: 'invalid-review',
    });
});

test('20. Invalid prepared proposal ID rejected', () => {
    const invalidIds = ['c0', 'c01', 'c100', '1', 'c', 'C1', 'c-1'];
    for (const id of invalidIds) {
        const review = createValidReview({
            proposals: [
                {
                    id,
                    name: 'Alice',
                    proposedColor: '#56B4E9',
                    color: '#56B4E9',
                    colorAdjusted: false,
                    contrastRatio: 4.5,
                },
            ],
        });
        assert.deepEqual(putPendingReview(review), { status: 'invalid-review' });
    }
});

test('21. Untrimmed/empty name rejected', () => {
    const invalidNames = ['', '   ', ' Alice', 'Alice ', '\tAlice\n'];
    for (const name of invalidNames) {
        const review = createValidReview({
            proposals: [
                {
                    id: 'c1',
                    name,
                    proposedColor: '#56B4E9',
                    color: '#56B4E9',
                    colorAdjusted: false,
                    contrastRatio: 4.5,
                },
            ],
        });
        assert.deepEqual(putPendingReview(review), { status: 'invalid-review' });
    }
});

test('22. Lowercase/noncanonical proposedColor rejected', () => {
    const invalidColors = ['#56b4e9', '56B4E9', '#FFF', 'rgb(0,0,0)', '#56B4E9A0'];
    for (const proposedColor of invalidColors) {
        const review = createValidReview({
            proposals: [
                {
                    id: 'c1',
                    name: 'Alice',
                    proposedColor,
                    color: '#56B4E9',
                    colorAdjusted: false,
                    contrastRatio: 4.5,
                },
            ],
        });
        assert.deepEqual(putPendingReview(review), { status: 'invalid-review' });
    }
});

test('23. Lowercase/noncanonical final color rejected', () => {
    const invalidColors = ['#56b4e9', '56B4E9', '#FFF', 'rgb(0,0,0)', '#56B4E9A0'];
    for (const color of invalidColors) {
        const review = createValidReview({
            proposals: [
                {
                    id: 'c1',
                    name: 'Alice',
                    proposedColor: '#56B4E9',
                    color,
                    colorAdjusted: false,
                    contrastRatio: 4.5,
                },
            ],
        });
        assert.deepEqual(putPendingReview(review), { status: 'invalid-review' });
    }
});

test('24. Non-boolean colorAdjusted rejected', () => {
    const invalidBools = [0, 1, 'false', 'true', null, undefined];
    for (const colorAdjusted of invalidBools) {
        const review = createValidReview({
            proposals: [
                {
                    id: 'c1',
                    name: 'Alice',
                    proposedColor: '#56B4E9',
                    color: '#56B4E9',
                    colorAdjusted,
                    contrastRatio: 4.5,
                },
            ],
        });
        assert.deepEqual(putPendingReview(review), { status: 'invalid-review' });
    }
});

test('25. Non-finite contrastRatio rejected', () => {
    const invalidRatios = [NaN, Infinity, -Infinity, '4.5'];
    for (const contrastRatio of invalidRatios) {
        const review = createValidReview({
            proposals: [
                {
                    id: 'c1',
                    name: 'Alice',
                    proposedColor: '#56B4E9',
                    color: '#56B4E9',
                    colorAdjusted: false,
                    contrastRatio,
                },
            ],
        });
        assert.deepEqual(putPendingReview(review), { status: 'invalid-review' });
    }
});

test('26. Contrast ratio outside 1..21 rejected', () => {
    const outOfBounds = [0, 0.999, 21.001, 22, -5];
    for (const contrastRatio of outOfBounds) {
        const review = createValidReview({
            proposals: [
                {
                    id: 'c1',
                    name: 'Alice',
                    proposedColor: '#56B4E9',
                    color: '#56B4E9',
                    colorAdjusted: false,
                    contrastRatio,
                },
            ],
        });
        assert.deepEqual(putPendingReview(review), { status: 'invalid-review' });
    }
});

test('27. Duplicate proposal ID rejected', () => {
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
                id: 'c1',
                name: 'Bob',
                proposedColor: '#B86FD4',
                color: '#B86FD4',
                colorAdjusted: false,
                contrastRatio: 5.2,
            },
        ],
    });
    assert.deepEqual(putPendingReview(review), { status: 'invalid-review' });
});

test('28. Duplicate exact proposal name rejected', () => {
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
                name: 'Alice',
                proposedColor: '#B86FD4',
                color: '#B86FD4',
                colorAdjusted: false,
                contrastRatio: 5.2,
            },
        ],
    });
    assert.deepEqual(putPendingReview(review), { status: 'invalid-review' });
});

test('29. Input review is detached from storage', () => {
    const review = createValidReview();
    putPendingReview(review);

    review.chatId = 'tampered';
    review.proposals[0].name = 'Tampered';
    review.proposals.push({ id: 'c99' });

    const stored = getPendingReview('chat-a', 0);
    assert.equal(stored.chatId, 'chat-a');
    assert.equal(stored.proposals.length, 1);
    assert.equal(stored.proposals[0].name, 'Alice');
});

test('30. get result mutation cannot alter storage', () => {
    putPendingReview(createValidReview());

    const read = getPendingReview('chat-a', 0);
    read.proposals[0].name = 'Mutated';
    read.proposals.push({ id: 'c99' });

    const fresh = getPendingReview('chat-a', 0);
    assert.equal(fresh.proposals.length, 1);
    assert.equal(fresh.proposals[0].name, 'Alice');
});

test('31. list result mutation cannot alter storage', () => {
    putPendingReview(createValidReview());

    const list = listPendingReviews('chat-a');
    list[0].proposals[0].name = 'Mutated';
    list.push({ fake: true });

    const fresh = listPendingReviews('chat-a');
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].proposals[0].name, 'Alice');
});

test('32. listPendingReviews filters exact chat', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-2', messageId: 1 }));

    const chat1List = listPendingReviews('chat-1');
    assert.equal(chat1List.length, 1);
    assert.equal(chat1List[0].chatId, 'chat-1');

    assert.deepEqual(listPendingReviews('chat-missing'), []);
    assert.deepEqual(listPendingReviews(' chat-1 '), []);
});

test('33. listPendingReviews sorts message IDs ascending', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 12 }));
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 3 }));
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 20 }));

    const list = listPendingReviews('chat-1');
    assert.deepEqual(
        list.map(r => r.messageId),
        [3, 12, 20],
    );
});

test('34. removePendingReview returns true on removal', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 5 }));

    assert.equal(removePendingReview('chat-1', 5), true);
    assert.strictEqual(getPendingReview('chat-1', 5), null);
});

test('35. removePendingReview returns false when missing', () => {
    assert.equal(removePendingReview('chat-1', 5), false);
    assert.equal(removePendingReview(' invalid ', 5), false);
    assert.equal(removePendingReview('chat-1', -1), false);
    assert.equal(removePendingReview('chat-1', '5'), false);
});

test('36. Removing one chat does not affect another', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 5 }));
    putPendingReview(createValidReview({ chatId: 'chat-2', messageId: 5 }));

    assert.equal(removePendingReview('chat-1', 5), true);
    assert.strictEqual(getPendingReview('chat-1', 5), null);
    assert.notStrictEqual(getPendingReview('chat-2', 5), null);
});

test('37. clearPendingReviewsForChat returns removed count', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 2 }));
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 3 }));

    assert.equal(clearPendingReviewsForChat('chat-1'), 3);
    assert.equal(clearPendingReviewsForChat('chat-1'), 0);
    assert.equal(clearPendingReviewsForChat(' invalid '), 0);
});

test('38. clearPendingReviewsForChat preserves other chats', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-2', messageId: 1 }));

    clearPendingReviewsForChat('chat-1');
    assert.equal(getPendingReviewCount('chat-1'), 0);
    assert.equal(getPendingReviewCount('chat-2'), 1);
});

test('39. clearAllPendingReviews returns total removed count', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 2 }));
    putPendingReview(createValidReview({ chatId: 'chat-2', messageId: 1 }));

    assert.equal(clearAllPendingReviews(), 3);
});

test('40. Repeated clearAll returns zero', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));

    assert.equal(clearAllPendingReviews(), 1);
    assert.equal(clearAllPendingReviews(), 0);
});

test('41. getPendingReviewCount() returns total', () => {
    assert.equal(getPendingReviewCount(), 0);

    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 2 }));
    putPendingReview(createValidReview({ chatId: 'chat-2', messageId: 1 }));

    assert.equal(getPendingReviewCount(), 3);
});

test('42. getPendingReviewCount(chatId) returns per-chat count', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 2 }));
    putPendingReview(createValidReview({ chatId: 'chat-2', messageId: 1 }));

    assert.equal(getPendingReviewCount('chat-1'), 2);
    assert.equal(getPendingReviewCount('chat-2'), 1);
    assert.equal(getPendingReviewCount('chat-3'), 0);
});

test('43. explicit undefined count argument returns zero', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));

    assert.equal(getPendingReviewCount(undefined), 0);
});

test('44. invalid count chatId returns zero', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));

    assert.equal(getPendingReviewCount(''), 0);
    assert.equal(getPendingReviewCount(' chat-1 '), 0);
    assert.equal(getPendingReviewCount(null), 0);
    assert.equal(getPendingReviewCount(123), 0);
});

test('45. Repeated get calls return separately detached values', () => {
    putPendingReview(createValidReview());

    const first = getPendingReview('chat-a', 0);
    const second = getPendingReview('chat-a', 0);

    assert.deepEqual(first, second);
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.proposals, second.proposals);
    assert.notStrictEqual(first.proposals[0], second.proposals[0]);
});

test('46. Repeated list calls return separately detached values', () => {
    putPendingReview(createValidReview());

    const first = listPendingReviews('chat-a');
    const second = listPendingReviews('chat-a');

    assert.deepEqual(first, second);
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first[0], second[0]);
    assert.notStrictEqual(first[0].proposals, second[0].proposals);
    assert.notStrictEqual(first[0].proposals[0], second[0].proposals[0]);
});

test('47. Store is synchronous and returns no Promises', () => {
    const putRes = putPendingReview(createValidReview());
    assert.strictEqual(putRes instanceof Promise, false);
    assert.strictEqual(typeof putRes?.then, 'undefined');

    const getRes = getPendingReview('chat-a', 0);
    assert.strictEqual(getRes instanceof Promise, false);
    assert.strictEqual(typeof getRes?.then, 'undefined');

    const listRes = listPendingReviews('chat-a');
    assert.strictEqual(listRes instanceof Promise, false);
    assert.strictEqual(typeof listRes?.then, 'undefined');

    const countRes = getPendingReviewCount();
    assert.strictEqual(countRes instanceof Promise, false);

    const removeRes = removePendingReview('chat-a', 0);
    assert.strictEqual(removeRes instanceof Promise, false);

    const clearChatRes = clearPendingReviewsForChat('chat-a');
    assert.strictEqual(clearChatRes instanceof Promise, false);

    const clearAllRes = clearAllPendingReviews();
    assert.strictEqual(clearAllRes instanceof Promise, false);
});

test('48. No SillyTavern or DOM dependency is required', () => {
    assert.strictEqual(typeof globalThis.SillyTavern, 'undefined');
    assert.strictEqual(typeof globalThis.window, 'undefined');
    assert.strictEqual(typeof globalThis.document, 'undefined');

    const review = createValidReview();
    const result = putPendingReview(review);
    assert.equal(result.status, 'stored');
});

test('49. No persistence APIs are used', () => {
    assert.strictEqual(typeof globalThis.localStorage, 'undefined');
    assert.strictEqual(typeof globalThis.sessionStorage, 'undefined');
    assert.strictEqual(typeof globalThis.indexedDB, 'undefined');

    putPendingReview(createValidReview());
    assert.equal(getPendingReviewCount(), 1);
});

test('50. Replacement does not accumulate historical versions', () => {
    putPendingReview(
        createValidReview({
            messageId: 1,
            proposals: [
                {
                    id: 'c1',
                    name: 'Mara',
                    proposedColor: '#56B4E9',
                    color: '#56B4E9',
                    colorAdjusted: false,
                    contrastRatio: 4.5,
                },
            ],
        }),
    );

    putPendingReview(
        createValidReview({
            messageId: 1,
            proposals: [
                {
                    id: 'c1',
                    name: 'Mara',
                    proposedColor: '#56B4E9',
                    color: '#56B4E9',
                    colorAdjusted: false,
                    contrastRatio: 4.5,
                },
                {
                    id: 'c2',
                    name: 'Jonas',
                    proposedColor: '#B86FD4',
                    color: '#B86FD4',
                    colorAdjusted: false,
                    contrastRatio: 5.2,
                },
            ],
        }),
    );

    assert.equal(getPendingReviewCount('chat-a'), 1);
    const list = listPendingReviews('chat-a');
    assert.equal(list.length, 1);
    assert.equal(list[0].proposals.length, 2);
    assert.equal(list[0].proposals[0].name, 'Mara');
    assert.equal(list[0].proposals[1].name, 'Jonas');
});

test('51. Class-instance review is rejected', () => {
    class Review {
        constructor() {
            this.chatId = 'chat-a';
            this.messageId = 1;
            this.proposals = [
                {
                    id: 'c1',
                    name: 'Alice',
                    proposedColor: '#56B4E9',
                    color: '#56B4E9',
                    colorAdjusted: false,
                    contrastRatio: 4.5,
                },
            ];
        }
    }

    assert.deepEqual(putPendingReview(new Review()), {
        status: 'invalid-review',
    });
});

test('52. Class-instance proposal is rejected', () => {
    class Proposal {
        constructor() {
            this.id = 'c1';
            this.name = 'Alice';
            this.proposedColor = '#56B4E9';
            this.color = '#56B4E9';
            this.colorAdjusted = false;
            this.contrastRatio = 4.5;
        }
    }

    assert.deepEqual(
        putPendingReview({
            chatId: 'chat-a',
            messageId: 1,
            proposals: [new Proposal()],
        }),
        { status: 'invalid-review' },
    );
});

test('53. Null-prototype plain review is accepted', () => {
    const review = Object.create(null);
    review.chatId = 'chat-a';
    review.messageId = 1;
    review.proposals = [
        {
            id: 'c1',
            name: 'Alice',
            proposedColor: '#56B4E9',
            color: '#56B4E9',
            colorAdjusted: false,
            contrastRatio: 4.5,
        },
    ];

    const result = putPendingReview(review);
    assert.equal(result.status, 'stored');
    assert.equal(getPendingReviewCount('chat-a'), 1);

    const fetched = getPendingReview('chat-a', 1);
    assert.equal(fetched.chatId, 'chat-a');
    assert.equal(fetched.messageId, 1);
    assert.equal(fetched.proposals[0].name, 'Alice');
});

test('54. Null-prototype proposal is accepted', () => {
    const proposal = Object.create(null);
    proposal.id = 'c1';
    proposal.name = 'Alice';
    proposal.proposedColor = '#56B4E9';
    proposal.color = '#56B4E9';
    proposal.colorAdjusted = false;
    proposal.contrastRatio = 4.5;

    const review = {
        chatId: 'chat-a',
        messageId: 1,
        proposals: [proposal],
    };

    const result = putPendingReview(review);
    assert.equal(result.status, 'stored');
    assert.equal(getPendingReviewCount('chat-a'), 1);

    const fetched = getPendingReview('chat-a', 1);
    assert.equal(fetched.proposals[0].name, 'Alice');
});

test('55. Non-function listener returns null without throwing', () => {
    assert.strictEqual(subscribePendingReviewChanges(null), null);
    assert.strictEqual(subscribePendingReviewChanges(undefined), null);
    assert.strictEqual(subscribePendingReviewChanges({}), null);
    assert.strictEqual(subscribePendingReviewChanges('listener'), null);
    assert.strictEqual(subscribePendingReviewChanges(123), null);
    assert.strictEqual(subscribePendingReviewChanges(true), null);
    assert.strictEqual(subscribePendingReviewChanges([]), null);
});

test('56. Valid listener returns synchronous unsubscribe function', () => {
    const listener = () => {};
    const unsub = subscribePendingReviewChanges(listener);

    assert.equal(typeof unsub, 'function');
    assert.strictEqual(unsub instanceof Promise, false);

    const firstResult = unsub();
    assert.strictEqual(firstResult, true);

    const secondResult = unsub();
    assert.strictEqual(secondResult, false);
});

test('57. Successful new put emits stored event with exact keys', () => {
    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        const review = createValidReview({ chatId: 'chat-sub', messageId: 3 });
        putPendingReview(review);

        assert.equal(events.length, 1);
        assert.deepEqual(events[0], {
            type: 'stored',
            chatId: 'chat-sub',
            messageId: 3,
        });
        assert.deepEqual(Object.keys(events[0]).sort(), ['chatId', 'messageId', 'type']);
    } finally {
        unsub();
    }
});

test('58. Successful replacement/upsert emits stored event', () => {
    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        putPendingReview(createValidReview({ chatId: 'chat-sub', messageId: 5 }));
        assert.equal(events.length, 1);

        putPendingReview(createValidReview({ chatId: 'chat-sub', messageId: 5 }));
        assert.equal(events.length, 2);
        assert.deepEqual(events[1], {
            type: 'stored',
            chatId: 'chat-sub',
            messageId: 5,
        });
    } finally {
        unsub();
    }
});

test('59. Invalid put emits nothing', () => {
    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        putPendingReview(null);
        putPendingReview({});
        putPendingReview(createValidReview({ proposals: [] }));
        putPendingReview(createValidReview({ chatId: ' invalid ' }));
        putPendingReview(createValidReview({ messageId: -1 }));

        assert.equal(events.length, 0);
    } finally {
        unsub();
    }
});

test('60. Successful removePendingReview emits removed event', () => {
    putPendingReview(createValidReview({ chatId: 'chat-sub', messageId: 7 }));

    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        const removed = removePendingReview('chat-sub', 7);
        assert.strictEqual(removed, true);
        assert.equal(events.length, 1);
        assert.deepEqual(events[0], {
            type: 'removed',
            chatId: 'chat-sub',
            messageId: 7,
        });
        assert.deepEqual(Object.keys(events[0]).sort(), ['chatId', 'messageId', 'type']);
    } finally {
        unsub();
    }
});

test('61. Missing or invalid remove emits nothing', () => {
    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        assert.strictEqual(removePendingReview('non-existent', 0), false);
        assert.strictEqual(removePendingReview(' chat-1 ', 0), false);
        assert.strictEqual(removePendingReview('chat-1', -1), false);
        assert.equal(events.length, 0);
    } finally {
        unsub();
    }
});

test('62. clearPendingReviewsForChat with records emits one chat-cleared event', () => {
    putPendingReview(createValidReview({ chatId: 'chat-sub', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-sub', messageId: 2 }));

    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        const count = clearPendingReviewsForChat('chat-sub');
        assert.equal(count, 2);
        assert.equal(events.length, 1);
        assert.deepEqual(events[0], {
            type: 'chat-cleared',
            chatId: 'chat-sub',
        });
        assert.deepEqual(Object.keys(events[0]).sort(), ['chatId', 'type']);
    } finally {
        unsub();
    }
});

test('63. clearPendingReviewsForChat with zero records emits nothing', () => {
    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        const count = clearPendingReviewsForChat('empty-chat');
        assert.equal(count, 0);
        assert.equal(events.length, 0);
    } finally {
        unsub();
    }
});

test('64. clearAllPendingReviews with records emits one all-cleared event', () => {
    putPendingReview(createValidReview({ chatId: 'chat-1', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-2', messageId: 1 }));

    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        const count = clearAllPendingReviews();
        assert.equal(count, 2);
        assert.equal(events.length, 1);
        assert.deepEqual(events[0], {
            type: 'all-cleared',
        });
        assert.deepEqual(Object.keys(events[0]), ['type']);
    } finally {
        unsub();
    }
});

test('65. clearAllPendingReviews when empty emits nothing', () => {
    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        const count = clearAllPendingReviews();
        assert.equal(count, 0);
        assert.equal(events.length, 0);
    } finally {
        unsub();
    }
});

test('66. Read operations emit nothing', () => {
    putPendingReview(createValidReview({ chatId: 'chat-sub', messageId: 1 }));

    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        getPendingReview('chat-sub', 1);
        getPendingReview('chat-sub', 999);
        listPendingReviews('chat-sub');
        listPendingReviews('empty');
        getPendingReviewCount();
        getPendingReviewCount('chat-sub');

        assert.equal(events.length, 0);
    } finally {
        unsub();
    }
});

test('67. Listener observes already-mutated store during stored event', () => {
    let observedState = null;
    const unsub = subscribePendingReviewChanges(event => {
        if (event.type === 'stored') {
            observedState = {
                review: getPendingReview(event.chatId, event.messageId),
                count: getPendingReviewCount(event.chatId),
                list: listPendingReviews(event.chatId),
            };
        }
    });

    try {
        putPendingReview(createValidReview({ chatId: 'chat-obs', messageId: 8 }));

        assert.notStrictEqual(observedState, null);
        assert.equal(observedState.review.messageId, 8);
        assert.equal(observedState.count, 1);
        assert.equal(observedState.list.length, 1);
    } finally {
        unsub();
    }
});

test('68. Listener observes already-mutated store during removed event', () => {
    putPendingReview(createValidReview({ chatId: 'chat-obs', messageId: 8 }));

    let observedReview = 'not-called';
    let observedCount = -1;
    const unsub = subscribePendingReviewChanges(event => {
        if (event.type === 'removed') {
            observedReview = getPendingReview(event.chatId, event.messageId);
            observedCount = getPendingReviewCount(event.chatId);
        }
    });

    try {
        removePendingReview('chat-obs', 8);

        assert.strictEqual(observedReview, null);
        assert.equal(observedCount, 0);
    } finally {
        unsub();
    }
});

test('69. Listener exception does not break putPendingReview', () => {
    const unsub = subscribePendingReviewChanges(() => {
        throw new Error('Listener failure in put');
    });

    try {
        const review = createValidReview({ chatId: 'chat-err', messageId: 1 });
        const result = putPendingReview(review);

        assert.equal(result.status, 'stored');
        assert.deepEqual(result.review, review);
        assert.notStrictEqual(getPendingReview('chat-err', 1), null);
    } finally {
        unsub();
    }
});

test('70. Listener exception does not break removePendingReview', () => {
    putPendingReview(createValidReview({ chatId: 'chat-err', messageId: 2 }));

    const unsub = subscribePendingReviewChanges(() => {
        throw new Error('Listener failure in remove');
    });

    try {
        const removed = removePendingReview('chat-err', 2);
        assert.strictEqual(removed, true);
        assert.strictEqual(getPendingReview('chat-err', 2), null);
    } finally {
        unsub();
    }
});

test('71. Throwing listener does not prevent later listeners', () => {
    let secondCalled = false;
    const unsub1 = subscribePendingReviewChanges(() => {
        throw new Error('Exploding first listener');
    });
    const unsub2 = subscribePendingReviewChanges(event => {
        if (event.type === 'stored') {
            secondCalled = true;
        }
    });

    try {
        putPendingReview(createValidReview({ chatId: 'chat-multi', messageId: 1 }));
        assert.strictEqual(secondCalled, true);
    } finally {
        unsub1();
        unsub2();
    }
});

test('72. Each listener receives detached event object', () => {
    let event1Ref = null;
    let event2Ref = null;

    const unsub1 = subscribePendingReviewChanges(event => {
        event1Ref = event;
        event.type = 'tampered';
        event.chatId = 'tampered';
        event.extra = 'polluted';
    });
    const unsub2 = subscribePendingReviewChanges(event => {
        event2Ref = event;
    });

    try {
        putPendingReview(createValidReview({ chatId: 'chat-clean', messageId: 1 }));

        assert.notStrictEqual(event1Ref, null);
        assert.notStrictEqual(event2Ref, null);
        assert.notStrictEqual(event1Ref, event2Ref);

        assert.equal(event2Ref.type, 'stored');
        assert.equal(event2Ref.chatId, 'chat-clean');
        assert.strictEqual(typeof event2Ref.extra, 'undefined');
    } finally {
        unsub1();
        unsub2();
    }
});

test('73. Duplicate registration of same function invokes once', () => {
    let callCount = 0;
    const listener = () => {
        callCount++;
    };

    const unsub1 = subscribePendingReviewChanges(listener);
    const unsub2 = subscribePendingReviewChanges(listener);

    try {
        putPendingReview(createValidReview({ chatId: 'chat-dup', messageId: 1 }));
        assert.equal(callCount, 1);
    } finally {
        unsub1();
        unsub2();
    }
});

test('74. Duplicate unsubscribe functions remove the single logical registration', () => {
    let callCount = 0;
    const listener = () => {
        callCount++;
    };

    const unsub1 = subscribePendingReviewChanges(listener);
    const unsub2 = subscribePendingReviewChanges(listener);

    const firstRemoved = unsub1();
    assert.strictEqual(firstRemoved, true);

    const secondRemoved = unsub2();
    assert.strictEqual(secondRemoved, false);

    putPendingReview(createValidReview({ chatId: 'chat-dup', messageId: 1 }));
    assert.equal(callCount, 0);
});

test('75. Unsubscribed listener receives no future events', () => {
    let callCount = 0;
    const unsub = subscribePendingReviewChanges(() => {
        callCount++;
    });

    putPendingReview(createValidReview({ chatId: 'chat-unsub', messageId: 1 }));
    assert.equal(callCount, 1);

    unsub();

    putPendingReview(createValidReview({ chatId: 'chat-unsub', messageId: 2 }));
    assert.equal(callCount, 1);
});

test('76. Unsubscribe emits no notification', () => {
    const events = [];
    const observer = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    const targetUnsub = subscribePendingReviewChanges(() => {});
    targetUnsub();

    try {
        assert.equal(events.length, 0);
    } finally {
        observer();
    }
});

test('77. Listener may unsubscribe itself during callback safely', () => {
    let unsub = null;
    let invocations = 0;

    unsub = subscribePendingReviewChanges(event => {
        invocations++;
        if (event.type === 'stored') {
            unsub();
        }
    });

    try {
        putPendingReview(createValidReview({ chatId: 'chat-self', messageId: 1 }));
        assert.equal(invocations, 1);

        putPendingReview(createValidReview({ chatId: 'chat-self', messageId: 2 }));
        assert.equal(invocations, 1);
    } finally {
        unsub();
    }
});

test('78. Listener A unsubscribing listener B during callback allows B to run from initial snapshot', () => {
    let unsubB = null;
    let bRan = false;

    const unsubA = subscribePendingReviewChanges(() => {
        if (unsubB) {
            unsubB();
        }
    });

    unsubB = subscribePendingReviewChanges(() => {
        bRan = true;
    });

    try {
        putPendingReview(createValidReview({ chatId: 'chat-cross', messageId: 1 }));
        assert.strictEqual(bRan, true);

        bRan = false;
        putPendingReview(createValidReview({ chatId: 'chat-cross', messageId: 2 }));
        assert.strictEqual(bRan, false);
    } finally {
        unsubA();
        unsubB();
    }
});

test('79. Newly subscribed listener during callback waits until next event', () => {
    let newUnsub = null;
    let newRan = false;

    const unsubA = subscribePendingReviewChanges(() => {
        if (!newUnsub) {
            newUnsub = subscribePendingReviewChanges(() => {
                newRan = true;
            });
        }
    });

    try {
        putPendingReview(createValidReview({ chatId: 'chat-new', messageId: 1 }));
        assert.strictEqual(newRan, false);

        putPendingReview(createValidReview({ chatId: 'chat-new', messageId: 2 }));
        assert.strictEqual(newRan, true);
    } finally {
        unsubA();
        if (newUnsub) {
            newUnsub();
        }
    }
});

test('80. Notification carries no review or proposals payload', () => {
    let capturedEvent = null;
    const unsub = subscribePendingReviewChanges(event => {
        capturedEvent = event;
    });

    try {
        putPendingReview(createValidReview({ chatId: 'chat-no-leak', messageId: 9 }));

        assert.strictEqual(typeof capturedEvent.proposals, 'undefined');
        assert.strictEqual(typeof capturedEvent.review, 'undefined');
        assert.strictEqual(typeof capturedEvent.count, 'undefined');
        assert.strictEqual(typeof capturedEvent.oldValue, 'undefined');
        assert.strictEqual(typeof capturedEvent.newValue, 'undefined');
    } finally {
        unsub();
    }
});

test('81. Different-chat puts produce correct corresponding events', () => {
    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        putPendingReview(createValidReview({ chatId: 'chat-alpha', messageId: 1 }));
        putPendingReview(createValidReview({ chatId: 'chat-beta', messageId: 1 }));

        assert.equal(events.length, 2);
        assert.equal(events[0].chatId, 'chat-alpha');
        assert.equal(events[1].chatId, 'chat-beta');
    } finally {
        unsub();
    }
});

test('82. clearPendingReviewsForChat preserves other chats and emits only the cleared chatId', () => {
    putPendingReview(createValidReview({ chatId: 'chat-keep', messageId: 1 }));
    putPendingReview(createValidReview({ chatId: 'chat-clear', messageId: 1 }));

    const events = [];
    const unsub = subscribePendingReviewChanges(event => {
        events.push(event);
    });

    try {
        const count = clearPendingReviewsForChat('chat-clear');
        assert.equal(count, 1);
        assert.equal(events.length, 1);
        assert.deepEqual(events[0], {
            type: 'chat-cleared',
            chatId: 'chat-clear',
        });
        assert.equal(getPendingReviewCount('chat-keep'), 1);
    } finally {
        unsub();
    }
});

test('83. Subscription system requires no DOM or SillyTavern', () => {
    assert.strictEqual(typeof globalThis.SillyTavern, 'undefined');
    assert.strictEqual(typeof globalThis.window, 'undefined');
    assert.strictEqual(typeof globalThis.document, 'undefined');

    let notified = false;
    const unsub = subscribePendingReviewChanges(() => {
        notified = true;
    });

    try {
        putPendingReview(createValidReview({ chatId: 'chat-nodom', messageId: 1 }));
        assert.strictEqual(notified, true);
    } finally {
        unsub();
    }
});