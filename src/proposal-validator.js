// src/proposal-validator.js
import {
    isValidAssignmentId,
    normalizeHexColor,
    normalizeName,
    normalizeStateForWrite,
} from './domain.js';

const ERROR_ORDER = [
    'invalid-state',
    'invalid-proposals',
    'registry-capacity-exceeded',
    'duplicate-id',
    'duplicate-name',
    'id-already-assigned',
    'name-already-assigned',
    'unexpected-id',
];

/**
 * Determine whether a value is a plain object.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const proto = Object.getPrototypeOf(value);

    return proto === Object.prototype || proto === null;
}

/**
 * Validate parsed proposals against the current Chromatic Dialogue registry state.
 *
 * @param {unknown} state
 * @param {unknown} proposals
 * @returns {{
 *     ok: boolean,
 *     proposals: Array<{ id: string, name: string, color: string }>,
 *     errors: string[],
 * }}
 */
export function validateRegistrationProposals(state, proposals) {
    const phase1Errors = new Set();

    const normalizedState = normalizeStateForWrite(state);
    if (!normalizedState) {
        phase1Errors.add('invalid-state');
    }

    let proposalsValid = true;
    const candidateProposals = [];

    if (!Array.isArray(proposals)) {
        proposalsValid = false;
    } else {
        for (const raw of proposals) {
            if (!isPlainObject(raw)) {
                proposalsValid = false;
                break;
            }

            const keys = Object.keys(raw);
            if (
                keys.length !== 3 ||
                !Object.prototype.hasOwnProperty.call(raw, 'id') ||
                !Object.prototype.hasOwnProperty.call(raw, 'name') ||
                !Object.prototype.hasOwnProperty.call(raw, 'color')
            ) {
                proposalsValid = false;
                break;
            }

            if (!isValidAssignmentId(raw.id)) {
                proposalsValid = false;
                break;
            }

            if (
                typeof raw.name !== 'string' ||
                typeof raw.color !== 'string'
            ) {
                proposalsValid = false;
                break;
            }

            const normalizedName = normalizeName(raw.name);
            const normalizedColor = normalizeHexColor(raw.color);

            if (normalizedName === null || normalizedColor === null) {
                proposalsValid = false;
                break;
            }

            candidateProposals.push({
                id: raw.id,
                name: normalizedName,
                color: normalizedColor,
            });
        }
    }

    if (!proposalsValid) {
        phase1Errors.add('invalid-proposals');
    }

    if (phase1Errors.size > 0) {
        return {
            ok: false,
            proposals: [],
            errors: ERROR_ORDER.filter(code => phase1Errors.has(code)),
        };
    }

    if (candidateProposals.length === 0) {
        return {
            ok: true,
            proposals: [],
            errors: [],
        };
    }

    const phase2Errors = new Set();

    const occupiedIds = Object.keys(normalizedState.assignments);
    const freeSlotCount = 99 - occupiedIds.length;

    if (candidateProposals.length > freeSlotCount) {
        phase2Errors.add('registry-capacity-exceeded');
    }

    const seenProposalIds = new Set();
    for (const proposal of candidateProposals) {
        if (seenProposalIds.has(proposal.id)) {
            phase2Errors.add('duplicate-id');
        }
        seenProposalIds.add(proposal.id);
    }

    const seenProposalNames = new Set();
    for (const proposal of candidateProposals) {
        const foldedName = proposal.name.toLowerCase();
        if (seenProposalNames.has(foldedName)) {
            phase2Errors.add('duplicate-name');
        }
        seenProposalNames.add(foldedName);
    }

    for (const proposal of candidateProposals) {
        if (Object.prototype.hasOwnProperty.call(normalizedState.assignments, proposal.id)) {
            phase2Errors.add('id-already-assigned');
        }
    }

    const existingFoldedNames = new Set();
    for (const assignment of Object.values(normalizedState.assignments)) {
        existingFoldedNames.add(assignment.name.toLowerCase());
    }

    for (const proposal of candidateProposals) {
        if (existingFoldedNames.has(proposal.name.toLowerCase())) {
            phase2Errors.add('name-already-assigned');
        }
    }

    if (phase2Errors.size > 0) {
        return {
            ok: false,
            proposals: [],
            errors: ERROR_ORDER.filter(code => phase2Errors.has(code)),
        };
    }

    const freeIds = [];
    for (let i = 1; i <= 99; i += 1) {
        const candidateId = `c${i}`;
        if (!Object.prototype.hasOwnProperty.call(normalizedState.assignments, candidateId)) {
            freeIds.push(candidateId);
        }
    }

    for (let i = 0; i < candidateProposals.length; i += 1) {
        if (candidateProposals[i].id !== freeIds[i]) {
            return {
                ok: false,
                proposals: [],
                errors: ['unexpected-id'],
            };
        }
    }

    return {
        ok: true,
        proposals: candidateProposals,
        errors: [],
    };
}