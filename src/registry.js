// src/registry.js
import { SCHEMA_VERSION } from './constants.js';
import {
    isValidAssignmentId,
    normalizeHexColor,
    normalizeName,
} from './domain.js';

/**
 * @typedef {import('./domain.js').Assignment} Assignment
 * @typedef {import('./domain.js').DialogueState} DialogueState
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
 * Escape special characters in a character name for compact serialization.
 *
 * @param {string} name
 * @returns {string}
 */
function escapeCompactName(name) {
    if (typeof name !== 'string') {
        return '';
    }

    return name
        .replaceAll('\\', '\\\\')
        .replaceAll('\r', '\\r')
        .replaceAll('\n', '\\n')
        .replaceAll('\t', '\\t')
        .replaceAll(',', '\\,')
        .replaceAll(';', '\\;')
        .replaceAll('=', '\\=');
}

/**
 * Validate an assignment candidate value.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidAssignment(value) {
    if (!isPlainObject(value)) {
        return false;
    }

    return (
        normalizeName(value.name) !== null &&
        normalizeHexColor(value.color) !== null
    );
}

/**
 * Check whether a state candidate is safe for query operations.
 *
 * @param {unknown} state
 * @returns {boolean}
 */
function isValidState(state) {
    if (!isPlainObject(state)) {
        return false;
    }

    if (
        state.schemaVersion !== undefined &&
        state.schemaVersion !== SCHEMA_VERSION
    ) {
        return false;
    }

    return isPlainObject(state.assignments);
}

/**
 * Extract the numeric portion of an assignment ID (e.g. 'c10' -> 10).
 *
 * @param {string} id
 * @returns {number}
 */
function getAssignmentIdNumber(id) {
    return Number.parseInt(id.slice(1), 10);
}

/**
 * Return the number of valid existing assignments.
 *
 * @param {unknown} state
 * @returns {number}
 */
export function getAssignmentCount(state) {
    if (!isValidState(state)) {
        return 0;
    }

    let count = 0;

    for (const [id, assignment] of Object.entries(state.assignments)) {
        if (isValidAssignmentId(id) && isValidAssignment(assignment)) {
            count += 1;
        }
    }

    return count;
}

/**
 * Return assignment entries ordered by the numeric portion of the assignment ID.
 * Returns detached copies so callers cannot mutate the original state.
 *
 * @param {unknown} state
 * @returns {Array<[string, Assignment]>}
 */
export function getOrderedAssignmentEntries(state) {
    if (!isValidState(state)) {
        return [];
    }

    const entries = [];

    for (const [id, assignment] of Object.entries(state.assignments)) {
        if (!isValidAssignmentId(id) || !isValidAssignment(assignment)) {
            continue;
        }

        entries.push([
            id,
            { ...assignment },
        ]);
    }

    entries.sort((a, b) => {
        return getAssignmentIdNumber(a[0]) - getAssignmentIdNumber(b[0]);
    });

    return entries;
}

/**
 * Return the first unused assignment ID between c1 and c99.
 *
 * @param {unknown} state
 * @returns {string | null}
 */
export function getNextFreeAssignmentId(state) {
    if (!isValidState(state)) {
        return 'c1';
    }

    const occupiedIds = new Set();

    for (const [id, assignment] of Object.entries(state.assignments)) {
        if (isValidAssignmentId(id) && isValidAssignment(assignment)) {
            occupiedIds.add(id);
        }
    }

    for (let i = 1; i <= 99; i += 1) {
        const candidateId = `c${i}`;

        if (!occupiedIds.has(candidateId)) {
            return candidateId;
        }
    }

    return null;
}

/**
 * Return ID/name pairs in deterministic numeric-ID order without colors.
 *
 * @param {unknown} state
 * @returns {string}
 */
export function buildCompactRoster(state) {
    const entries = getOrderedAssignmentEntries(state);

    if (entries.length === 0) {
        return '';
    }

    return entries
        .map(([id, assignment]) => `${id}=${escapeCompactName(normalizeName(assignment.name))}`)
        .join('; ');
}

/**
 * Return a compact deterministic string suitable for insertion into an AI prompt.
 *
 * @param {unknown} state
 * @returns {string}
 */
export function buildCompactRegistryState(state) {
    const entries = getOrderedAssignmentEntries(state);
    const count = entries.length;
    const roster = entries
        .map(([id, assignment]) => `${id}=${escapeCompactName(normalizeName(assignment.name))}`)
        .join(',');
    const nextId = getNextFreeAssignmentId(state);
    const next = nextId !== null ? nextId : 'none';

    return `count=${count}; roster=${roster}; next=${next}`;
}