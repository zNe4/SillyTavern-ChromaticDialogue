import { SCHEMA_VERSION } from './constants.js';

const ASSIGNMENT_ID_PATTERN = /^c(?:[1-9]|[1-9][0-9])$/;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * @typedef {{ name: string, color: string }} Assignment
 * @typedef {{
 *     schemaVersion: number,
 *     assignments: Record<string, Assignment>,
 * }} DialogueState
 */

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
 * Validate an already-canonical assignment ID.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidAssignmentId(value) {
    return (
        typeof value === 'string' &&
        ASSIGNMENT_ID_PATTERN.test(value)
    );
}

/**
 * Normalize a stored assignment ID.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeAssignmentId(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalizedId = value.trim().toLowerCase();

    return isValidAssignmentId(normalizedId) ? normalizedId : null;
}

/**
 * Normalize a character name.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeName(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalizedName = value.trim();

    return normalizedName.length > 0 ? normalizedName : null;
}

/**
 * Validate a six-digit hexadecimal color.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidHexColor(value) {
    return (
        typeof value === 'string' &&
        HEX_COLOR_PATTERN.test(value)
    );
}

/**
 * Normalize a six-digit hexadecimal color.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeHexColor(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalizedColor = value.trim();

    return isValidHexColor(normalizedColor)
        ? normalizedColor.toUpperCase()
        : null;
}

/**
 * Create a new empty schema-version-1 state.
 *
 * @returns {DialogueState}
 */
export function createEmptyState() {
    return {
        schemaVersion: SCHEMA_VERSION,
        assignments: {},
    };
}

/**
 * Safely normalize stored chat metadata.
 *
 * Missing or malformed version-1 data becomes a valid empty or partial state.
 * An explicit unsupported schema version returns null so callers do not
 * interpret or overwrite data belonging to a newer schema.
 *
 * @param {unknown} value
 * @returns {DialogueState | null}
 */
export function normalizeState(value) {
    if (!isPlainObject(value)) {
        return createEmptyState();
    }

    if (
        value.schemaVersion !== undefined &&
        value.schemaVersion !== SCHEMA_VERSION
    ) {
        return null;
    }

    const state = createEmptyState();

    if (!isPlainObject(value.assignments)) {
        return state;
    }

    for (const [rawId, rawAssignment] of Object.entries(value.assignments)) {
        const id = normalizeAssignmentId(rawId);

        if (
            !id ||
            Object.prototype.hasOwnProperty.call(state.assignments, id) ||
            !isPlainObject(rawAssignment)
        ) {
            continue;
        }

        const name = normalizeName(rawAssignment.name);
        const color = normalizeHexColor(rawAssignment.color);

        if (!name || !color) {
            continue;
        }

        state.assignments[id] = {
            name,
            color,
        };
    }

    return state;
}
/**
 * Normalize a complete state intended for persistence.
 *
 * Unlike stored-data normalization, any malformed assignment rejects the
 * entire candidate so a write cannot silently discard existing entries.
 *
 * @param {unknown} value
 * @returns {DialogueState | null}
 */
export function normalizeStateForWrite(value) {
    if (
        !isPlainObject(value) ||
        value.schemaVersion !== SCHEMA_VERSION ||
        !isPlainObject(value.assignments)
    ) {
        return null;
    }

    const state = createEmptyState();

    for (const [id, rawAssignment] of Object.entries(value.assignments)) {
        if (
            !isValidAssignmentId(id) ||
            Object.prototype.hasOwnProperty.call(state.assignments, id) ||
            !isPlainObject(rawAssignment)
        ) {
            return null;
        }

        const name = normalizeName(rawAssignment.name);
        const color = normalizeHexColor(rawAssignment.color);

        if (!name || !color) {
            return null;
        }

        state.assignments[id] = {
            name,
            color,
        };
    }

    return state;
}
