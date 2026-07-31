import {
    CHAT_CONTENT_SELECTOR,
    DIALOGUE_CLASS_PREFIX,
    GENERATED_STYLE_ID,
} from './constants.js';
import {
    isValidAssignmentId,
    normalizeHexColor,
    normalizeName,
} from './domain.js';

/**
 * Determine whether a value is a plain object.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
    if (value === null || typeof value !== 'object') {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
}

/**
 * Validate that an assignment already uses canonical domain values.
 *
 * @param {unknown} assignment
 * @returns {boolean}
 */
function isNormalizedAssignment(assignment) {
    if (!isPlainObject(assignment)) {
        return false;
    }

    return (
        normalizeName(assignment.name) === assignment.name &&
        normalizeHexColor(assignment.color) === assignment.color
    );
}

/**
 * Generate deterministic, chat-scoped CSS from normalized assignments.
 *
 * A null value represents no active chat. Invalid or merely normalizable
 * values are rejected instead of being interpolated into a selector or rule.
 *
 * @param {unknown} assignments
 * @returns {string}
 */
export function buildDialogueCss(assignments) {
    if (assignments === null) {
        return '';
    }

    if (!isPlainObject(assignments)) {
        throw new TypeError('Assignments must be a normalized mapping.');
    }

    const entries = Object.entries(assignments);

    for (const [id, assignment] of entries) {
        if (
            !isValidAssignmentId(id) ||
            !isNormalizedAssignment(assignment)
        ) {
            throw new TypeError(
                'Assignments must contain canonical IDs, names, and colors.',
            );
        }
    }

    entries.sort(
        ([leftId], [rightId]) =>
            Number(leftId.slice(1)) - Number(rightId.slice(1)),
    );

    return entries
        .map(
            ([id, assignment]) =>
                `${CHAT_CONTENT_SELECTOR} .${DIALOGUE_CLASS_PREFIX}${id} {\n` +
                `    color: ${assignment.color};\n` +
                '}',
        )
        .join('\n\n');
}

/**
 * Create or reuse the extension's single generated style element.
 *
 * @param {Document} targetDocument
 * @returns {HTMLStyleElement}
 */
export function ensureGeneratedStyleElement(targetDocument = document) {
    const existingStyle = targetDocument.getElementById(GENERATED_STYLE_ID);

    if (existingStyle) {
        if (existingStyle.tagName?.toLowerCase() !== 'style') {
            throw new Error(
                `#${GENERATED_STYLE_ID} exists but is not a style element.`,
            );
        }

        return existingStyle;
    }

    if (!targetDocument.head) {
        throw new Error('Cannot mount generated styles without document.head.');
    }

    const style = targetDocument.createElement('style');

    style.id = GENERATED_STYLE_ID;
    targetDocument.head.append(style);

    return style;
}

/**
 * Atomically replace the generated CSS for the active chat.
 *
 * @param {unknown} assignments
 * @param {Document} targetDocument
 * @returns {HTMLStyleElement}
 */
export function applyDialogueStyles(
    assignments,
    targetDocument = document,
) {
    const css = buildDialogueCss(assignments);
    const style = ensureGeneratedStyleElement(targetDocument);

    style.textContent = css;

    return style;
}
