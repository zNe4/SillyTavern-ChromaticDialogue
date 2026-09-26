import {
    REVIEW_SECTION_ID,
    REVIEW_COUNT_ID,
    REVIEW_LIST_ID,
    REVIEW_FEEDBACK_ID,
} from './constants.js';
import { listPendingReviews } from './pending-review-store.js';
import { approvePendingReview } from './review-approval-service.js';
import { dismissPendingReview } from './review-dismissal-service.js';

/**
 * Validate that a chatId is an exact non-empty trimmed string.
 *
 * @param {unknown} chatId
 * @returns {boolean}
 */
function isValidChatId(chatId) {
    return (
        typeof chatId === 'string' &&
        chatId.length > 0 &&
        chatId.trim() === chatId
    );
}

/**
 * Clear all child nodes from an element.
 *
 * @param {object} element
 */
function clearChildren(element) {
    if (typeof element.replaceChildren === 'function') {
        element.replaceChildren();
    }
    element.textContent = '';
}

/**
 * Clear and hide the review section feedback element.
 *
 * @param {object} feedback
 */
function clearReviewFeedback(feedback) {
    feedback.textContent = '';
    if (feedback.dataset) {
        delete feedback.dataset.feedbackKind;
    }
    feedback.hidden = true;
}

/**
 * Display a user-facing feedback message in the review section.
 *
 * @param {object} feedback
 * @param {string} message
 * @param {'valid' | 'error'} kind
 */
function showReviewFeedback(feedback, message, kind) {
    feedback.textContent = message;
    if (!feedback.dataset) {
        feedback.dataset = {};
    }
    feedback.dataset.feedbackKind = kind;
    feedback.hidden = false;
}

/**
 * Create a DOM card for one pending review item.
 *
 * @param {object} review
 * @param {object} deps
 * @param {Document} doc
 * @returns {HTMLElement}
 */
function createReviewCard(review, deps, doc) {
    const { approveReview, dismissReview, feedbackEl } = deps;

    const card = doc.createElement('div');
    card.className = 'chromatic-dialogue-review-card';
    card.setAttribute('role', 'listitem');
    if (!card.dataset) {
        card.dataset = {};
    }
    card.dataset.messageId = String(review.messageId);

    // Card header
    const header = doc.createElement('div');
    header.className = 'chromatic-dialogue-review-card-header';

    const messageIdSpan = doc.createElement('span');
    messageIdSpan.className = 'chromatic-dialogue-review-message-id';
    messageIdSpan.textContent = `Message ${review.messageId}`;
    header.appendChild(messageIdSpan);
    card.appendChild(header);

    // Proposals list
    const proposalsContainer = doc.createElement('div');
    proposalsContainer.className = 'chromatic-dialogue-review-proposals';

    const proposals = Array.isArray(review.proposals) ? review.proposals : [];
    for (const proposal of proposals) {
        const proposalEl = doc.createElement('div');
        proposalEl.className = 'chromatic-dialogue-review-proposal';

        const idSpan = doc.createElement('span');
        idSpan.className = 'chromatic-dialogue-review-proposal-id';
        idSpan.textContent = proposal.id;
        proposalEl.appendChild(idSpan);

        const nameSpan = doc.createElement('span');
        nameSpan.className = 'chromatic-dialogue-review-proposal-name';
        nameSpan.textContent = proposal.name;
        proposalEl.appendChild(nameSpan);

        const colorRow = doc.createElement('div');
        colorRow.className = 'chromatic-dialogue-review-color-row';

        const swatch = doc.createElement('span');
        swatch.className = 'chromatic-dialogue-review-color-swatch';
        swatch.style.backgroundColor = proposal.color;
        colorRow.appendChild(swatch);

        const colorValue = doc.createElement('span');
        colorValue.className = 'chromatic-dialogue-review-color-value';
        colorValue.textContent = proposal.color;
        colorRow.appendChild(colorValue);

        if (proposal.colorAdjusted === true) {
            const adjustedSpan = doc.createElement('span');
            adjustedSpan.className = 'chromatic-dialogue-review-adjusted';
            adjustedSpan.textContent = `Adjusted for contrast from ${proposal.proposedColor}`;
            colorRow.appendChild(adjustedSpan);
        }

        const contrastSpan = doc.createElement('span');
        contrastSpan.className = 'chromatic-dialogue-review-contrast';
        if (
            typeof proposal.contrastRatio === 'number' &&
            Number.isFinite(proposal.contrastRatio)
        ) {
            contrastSpan.textContent = `Contrast ${proposal.contrastRatio.toFixed(2)}:1`;
        } else {
            contrastSpan.textContent = 'Contrast unavailable';
        }
        colorRow.appendChild(contrastSpan);

        proposalEl.appendChild(colorRow);
        proposalsContainer.appendChild(proposalEl);
    }
    card.appendChild(proposalsContainer);

    // Action buttons
    const actions = doc.createElement('div');
    actions.className = 'chromatic-dialogue-review-actions';

    const isMultiple = proposals.length > 1;

    const dismissBtn = doc.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'menu_button';
    dismissBtn.textContent = isMultiple ? 'Dismiss all' : 'Dismiss';
    dismissBtn.setAttribute(
        'aria-label',
        isMultiple
            ? `Dismiss all pending proposals from message ${review.messageId}`
            : `Dismiss pending review from message ${review.messageId}`,
    );

    const approveBtn = doc.createElement('button');
    approveBtn.type = 'button';
    approveBtn.className = 'menu_button';
    approveBtn.textContent = isMultiple ? 'Approve all' : 'Approve';
    approveBtn.setAttribute(
        'aria-label',
        isMultiple
            ? `Approve all pending proposals from message ${review.messageId}`
            : `Approve pending review from message ${review.messageId}`,
    );

    actions.appendChild(dismissBtn);
    actions.appendChild(approveBtn);
    card.appendChild(actions);

    function setButtonsDisabled(disabled) {
        dismissBtn.disabled = disabled;
        approveBtn.disabled = disabled;
    }

    dismissBtn.addEventListener('click', () => {
        setButtonsDisabled(true);

        let result;
        try {
            result = dismissReview(review);
        } catch {
            setButtonsDisabled(false);
            showReviewFeedback(
                feedbackEl,
                'Failed to dismiss review. Please try again.',
                'error',
            );
            return;
        }

        if (result.status === 'dismissed' || result.status === 'no-pending') {
            return;
        }

        if (result.status === 'stale-review') {
            showReviewFeedback(
                feedbackEl,
                'This pending proposal has changed. Please review the updated proposal.',
                'error',
            );
            return;
        }

        if (result.status === 'invalid-review') {
            setButtonsDisabled(false);
            showReviewFeedback(
                feedbackEl,
                'Unable to dismiss this proposal: invalid review data.',
                'error',
            );
            return;
        }

        setButtonsDisabled(false);
        showReviewFeedback(
            feedbackEl,
            'Failed to dismiss review. Please try again.',
            'error',
        );
    });

    approveBtn.addEventListener('click', async () => {
        setButtonsDisabled(true);

        let result;
        try {
            result = await approveReview(review.chatId, review.messageId);
        } catch {
            setButtonsDisabled(false);
            showReviewFeedback(
                feedbackEl,
                'Failed to approve proposals. Please try again.',
                'error',
            );
            return;
        }

        if (result.status === 'approved') {
            if (result.pendingRemoved === false) {
                showReviewFeedback(
                    feedbackEl,
                    'Dialogue colors approved, but a newer proposal remains pending for review.',
                    'valid',
                );
            } else {
                showReviewFeedback(
                    feedbackEl,
                    'Dialogue color proposals approved and saved.',
                    'valid',
                );
            }
            return;
        }

        if (result.status === 'already-applied') {
            if (result.pendingRemoved === false) {
                showReviewFeedback(
                    feedbackEl,
                    'Dialogue colors were already applied, but a newer proposal remains pending for review.',
                    'valid',
                );
            } else {
                showReviewFeedback(
                    feedbackEl,
                    'Dialogue color proposals are already applied.',
                    'valid',
                );
            }
            return;
        }

        if (result.status === 'no-pending') {
            showReviewFeedback(
                feedbackEl,
                'This pending proposal has already been handled.',
                'valid',
            );
            return;
        }

        setButtonsDisabled(false);

        switch (result.status) {
            case 'chat-changed':
                showReviewFeedback(
                    feedbackEl,
                    'Active chat changed. Switch back to approve this proposal.',
                    'error',
                );
                break;
            case 'source-unavailable':
                showReviewFeedback(
                    feedbackEl,
                    'Source message is no longer available.',
                    'error',
                );
                break;
            case 'stale-pending':
                showReviewFeedback(
                    feedbackEl,
                    'The message content has changed. Please review the updated proposal.',
                    'error',
                );
                break;
            case 'runtime-unavailable':
                showReviewFeedback(
                    feedbackEl,
                    'Theme background styling is currently unavailable. Please retry shortly.',
                    'error',
                );
                break;
            case 'registration-rejected':
                showReviewFeedback(
                    feedbackEl,
                    'Proposal was rejected by the registration service.',
                    'error',
                );
                break;
            case 'unsupported-schema':
                showReviewFeedback(
                    feedbackEl,
                    'This chat uses an unsupported metadata schema.',
                    'error',
                );
                break;
            case 'registration-failed':
                showReviewFeedback(
                    feedbackEl,
                    'Failed to register proposals. Please try again.',
                    'error',
                );
                break;
            case 'persistence-error':
                showReviewFeedback(
                    feedbackEl,
                    'Failed to save dialogue assignments to chat metadata. Please try again.',
                    'error',
                );
                break;
            case 'invalid-review-key':
                showReviewFeedback(
                    feedbackEl,
                    'Invalid review key.',
                    'error',
                );
                break;
            default:
                showReviewFeedback(
                    feedbackEl,
                    'Failed to approve proposals. Please try again.',
                    'error',
                );
                break;
        }
    });

    return card;
}

/**
 * Synchronously renders the pending character review UI inside the settings panel.
 *
 * @param {HTMLElement} panel
 * @param {string} chatId
 * @param {object} [_deps] Testing overrides
 * @returns {number} The count of rendered review cards
 */
export function renderReviewPanel(panel, chatId, _deps = {}) {
    if (!panel || typeof panel.querySelector !== 'function') {
        return 0;
    }

    const section = panel.querySelector(`#${REVIEW_SECTION_ID}`);
    const countEl = panel.querySelector(`#${REVIEW_COUNT_ID}`);
    const listEl = panel.querySelector(`#${REVIEW_LIST_ID}`);
    const feedbackEl = panel.querySelector(`#${REVIEW_FEEDBACK_ID}`);

    if (!section || !countEl || !listEl || !feedbackEl) {
        return 0;
    }

    countEl.textContent = '0';
    clearChildren(listEl);
    section.hidden = true;
    clearReviewFeedback(feedbackEl);

    if (!isValidChatId(chatId)) {
        return 0;
    }

    const listReviews = _deps.listPendingReviews ?? listPendingReviews;
    const approveReview = _deps.approvePendingReview ?? approvePendingReview;
    const dismissReview = _deps.dismissPendingReview ?? dismissPendingReview;

    const reviews = listReviews(chatId);
    if (!Array.isArray(reviews) || reviews.length === 0) {
        return 0;
    }

    const doc = panel.ownerDocument || globalThis.document;

    section.hidden = false;
    countEl.textContent = String(reviews.length);

    for (const review of reviews) {
        const card = createReviewCard(
            review,
            {
                approveReview,
                dismissReview,
                feedbackEl,
            },
            doc,
        );
        listEl.appendChild(card);
    }

    return reviews.length;
}