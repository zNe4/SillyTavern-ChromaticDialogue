import { isValidAssignmentId } from './domain.js';

/**
 * Closed vocabulary of supported vocal delivery tones in canonical order.
 *
 * @type {readonly ['whisper', 'shout', 'measured', 'tremble']}
 */
export const DIALOGUE_TONES = Object.freeze([
    'whisper',
    'shout',
    'measured',
    'tremble',
]);

/**
 * Determine whether a value is one of the exact supported lowercase dialogue tones.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSupportedDialogueTone(value) {
    return typeof value === 'string' && DIALOGUE_TONES.includes(value);
}

/**
 * Determine whether a message contains an accepted opening dialogue marker for a character ID.
 *
 * Checks for either ordinary [cN] or supported toned [cN:tone] opening markers.
 * Closing markers are not required for registration marker-use validation.
 *
 * @param {unknown} message
 * @param {unknown} id
 * @returns {boolean}
 */
export function hasDialogueMarkerForId(message, id) {
    if (typeof message !== 'string' || !isValidAssignmentId(id)) {
        return false;
    }

    if (message.includes(`[${id}]`)) {
        return true;
    }

    for (const tone of DIALOGUE_TONES) {
        if (message.includes(`[${id}:${tone}]`)) {
            return true;
        }
    }

    return false;
}