import {
    isValidAssignmentId,
    normalizeHexColor,
    normalizeName,
} from './domain.js';
import { hasDialogueMarkerForId } from './dialogue-syntax.js';

const CONTROL_COMMENT_PATTERN = /<!--[ \t]*CD_NEW\b/;
const MULTILINE_CD_NEW_COMMENT_PATTERN = /<!--\s*CD_NEW\b[\s\S]*?-->/g;
const UNCLOSED_MULTILINE_CD_NEW_COMMENT_PATTERN = /<!--\s*CD_NEW\b/;

const ERROR_ORDER = [
    'invalid-message',
    'misplaced-control-record',
    'malformed-control-record',
    'invalid-json',
    'invalid-proposal-shape',
    'invalid-proposal-value',
    'duplicate-id',
    'duplicate-name',
    'marker-not-used',
];

/**
 * Determine whether a value is a non-null, non-array plain object.
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
 * Check whether a message contains multiline HTML comments that attempt to start with CD_NEW.
 *
 * @param {string} message
 * @returns {boolean}
 */
function hasMultilineCdNewComment(message) {
    const matches = message.match(MULTILINE_CD_NEW_COMMENT_PATTERN);
    if (matches) {
        for (const match of matches) {
            if (/\r?\n/.test(match)) {
                return true;
            }
        }
    }

    const lines = message.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (UNCLOSED_MULTILINE_CD_NEW_COMMENT_PATTERN.test(line) && !line.includes('-->')) {
            return true;
        }
    }

    return false;
}

/**
 * Safely parse registration control records from a message.
 *
 * @param {unknown} message
 * @returns {{
 *     ok: boolean,
 *     proposals: Array<{ id: string, name: string, color: string }>,
 *     errors: string[],
 * }}
 */
export function parseRegistrationTrailer(message) {
    if (typeof message !== 'string') {
        return {
            ok: false,
            proposals: [],
            errors: ['invalid-message'],
        };
    }

    if (message.trim().length === 0 || !message.includes('CD_NEW')) {
        return {
            ok: true,
            proposals: [],
            errors: [],
        };
    }

    if (hasMultilineCdNewComment(message)) {
        return {
            ok: false,
            proposals: [],
            errors: ['malformed-control-record'],
        };
    }

    const lines = message.split(/\r?\n/);
    let firstControlLineIndex = -1;

    for (let i = 0; i < lines.length; i += 1) {
        if (CONTROL_COMMENT_PATTERN.test(lines[i])) {
            firstControlLineIndex = i;
            break;
        }
    }

    if (firstControlLineIndex === -1) {
        return {
            ok: true,
            proposals: [],
            errors: [],
        };
    }

    const phase1Errors = new Set();
    const candidateProposals = [];
    let inBlock = true;

    for (let i = firstControlLineIndex; i < lines.length; i += 1) {
        const line = lines[i];

        if (line.trim().length === 0) {
            continue;
        }

        if (!CONTROL_COMMENT_PATTERN.test(line)) {
            inBlock = false;
            continue;
        }

        if (!inBlock) {
            phase1Errors.add('misplaced-control-record');
            continue;
        }

        const commentStart = line.indexOf('<!--');
        const commentEnd = line.lastIndexOf('-->');

        if (line.slice(0, commentStart).trim().length > 0) {
            phase1Errors.add('misplaced-control-record');
            continue;
        }

        const openMatches = line.match(/<!--/g);
        if (openMatches && openMatches.length > 1) {
            phase1Errors.add('misplaced-control-record');
            continue;
        }

        if (commentEnd === -1 || commentEnd < commentStart) {
            phase1Errors.add('malformed-control-record');
            continue;
        }

        if (line.slice(commentEnd + 3).trim().length > 0) {
            phase1Errors.add('misplaced-control-record');
            continue;
        }

        const inner = line.slice(commentStart + 4, commentEnd);
        const innerTrimmedStart = inner.trimStart();
        const afterCdNew = innerTrimmedStart.slice('CD_NEW'.length);
        const rawPayload = afterCdNew.trim();

        if (rawPayload.length === 0) {
            phase1Errors.add('malformed-control-record');
            continue;
        }

        let parsedJson;
        try {
            parsedJson = JSON.parse(rawPayload);
        } catch {
            phase1Errors.add('invalid-json');
            continue;
        }

        if (!isPlainObject(parsedJson)) {
            phase1Errors.add('invalid-proposal-shape');
            continue;
        }

        const keys = Object.keys(parsedJson);
        const hasExpectedKeys =
            keys.length === 3 &&
            Object.prototype.hasOwnProperty.call(parsedJson, 'id') &&
            Object.prototype.hasOwnProperty.call(parsedJson, 'name') &&
            Object.prototype.hasOwnProperty.call(parsedJson, 'color');

        if (!hasExpectedKeys) {
            phase1Errors.add('invalid-proposal-shape');
            continue;
        }

        let isValueValid = true;

        if (!isValidAssignmentId(parsedJson.id)) {
            isValueValid = false;
        }

        if (
            typeof parsedJson.name !== 'string' ||
            parsedJson.name.includes('-->') ||
            normalizeName(parsedJson.name) === null
        ) {
            isValueValid = false;
        }

        if (
            typeof parsedJson.color !== 'string' ||
            normalizeHexColor(parsedJson.color) === null
        ) {
            isValueValid = false;
        }

        if (!isValueValid) {
            phase1Errors.add('invalid-proposal-value');
            continue;
        }

        candidateProposals.push({
            id: parsedJson.id,
            name: normalizeName(parsedJson.name),
            color: normalizeHexColor(parsedJson.color),
        });
    }

    if (phase1Errors.size > 0) {
        return {
            ok: false,
            proposals: [],
            errors: ERROR_ORDER.filter(code => phase1Errors.has(code)),
        };
    }

    const phase2Errors = new Set();
    const seenIds = new Set();
    const seenNames = new Set();

    for (const proposal of candidateProposals) {
        if (seenIds.has(proposal.id)) {
            phase2Errors.add('duplicate-id');
        }
        seenIds.add(proposal.id);

        if (seenNames.has(proposal.name)) {
            phase2Errors.add('duplicate-name');
        }
        seenNames.add(proposal.name);

        if (!hasDialogueMarkerForId(message, proposal.id)) {
            phase2Errors.add('marker-not-used');
        }
    }

    const errors = ERROR_ORDER.filter(code => phase2Errors.has(code));
    const ok = errors.length === 0;

    return {
        ok,
        proposals: ok ? candidateProposals : [],
        errors,
    };
}