import { normalizeHexColor } from './domain.js';
import { parseRegistrationTrailer } from './proposal-parser.js';
import { validateRegistrationProposals } from './proposal-validator.js';
import { adjustColorForContrast } from './color-contrast.js';

const CONTRAST_ERROR_ORDER = [
    'contrast-unreachable',
    'contrast-processing-failed',
];

/**
 * Validate options for proposal preparation.
 *
 * @param {unknown} options
 * @returns {{ backgroundColor: string, minimumContrast: number } | null}
 */
function validateOptions(options) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
        return null;
    }

    const proto = Object.getPrototypeOf(options);
    if (proto !== Object.prototype && proto !== null) {
        return null;
    }

    const keys = Object.keys(options);
    const symbolKeys = Object.getOwnPropertySymbols(options).filter(sym =>
        Object.prototype.propertyIsEnumerable.call(options, sym),
    );
    if (symbolKeys.length > 0) {
        return null;
    }

    let hasBg = false;
    let minContrast = 4.5;

    for (const key of keys) {
        if (key === 'backgroundColor') {
            hasBg = true;
        } else if (key === 'minimumContrast') {
            // validated below
        } else {
            return null;
        }
    }

    if (!hasBg) {
        return null;
    }

    const normalizedBg = normalizeHexColor(options.backgroundColor);
    if (!normalizedBg) {
        return null;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'minimumContrast')) {
        const val = options.minimumContrast;
        if (val !== undefined) {
            if (
                typeof val !== 'number' ||
                !Number.isFinite(val) ||
                val < 1 ||
                val > 21
            ) {
                return null;
            }
            minContrast = val;
        }
    }

    return {
        backgroundColor: normalizedBg,
        minimumContrast: minContrast,
    };
}

/**
 * Prepare and adjust character registration proposals from an assistant message.
 *
 * @param {unknown} message
 * @param {unknown} state
 * @param {unknown} options
 * @returns {{
 *     status: 'no-proposals' | 'ready' | 'parse-rejected' | 'registry-rejected' | 'contrast-rejected' | 'invalid-options',
 *     proposals: Array<{
 *         id: string,
 *         name: string,
 *         proposedColor: string,
 *         color: string,
 *         colorAdjusted: boolean,
 *         contrastRatio: number,
 *     }>,
 *     errors?: string[],
 * }}
 */
export function prepareRegistrationProposals(message, state, options) {
    const validatedOptions = validateOptions(options);
    if (!validatedOptions) {
        return {
            status: 'invalid-options',
            proposals: [],
            errors: ['invalid-options'],
        };
    }

    const parseResult = parseRegistrationTrailer(message);
    if (!parseResult.ok) {
        return {
            status: 'parse-rejected',
            proposals: [],
            errors: [...parseResult.errors],
        };
    }

    if (parseResult.proposals.length === 0) {
        return {
            status: 'no-proposals',
            proposals: [],
            errors: [],
        };
    }

    const validatorResult = validateRegistrationProposals(state, parseResult.proposals);
    if (!validatorResult.ok) {
        return {
            status: 'registry-rejected',
            proposals: [],
            errors: [...validatorResult.errors],
        };
    }

    const preparedProposals = [];
    const contrastErrors = new Set();

    for (const proposal of validatorResult.proposals) {
        const adjustment = adjustColorForContrast(
            proposal.color,
            validatedOptions.backgroundColor,
            validatedOptions.minimumContrast,
        );

        if (!adjustment.ok) {
            if (adjustment.error === 'unreachable') {
                contrastErrors.add('contrast-unreachable');
            } else {
                contrastErrors.add('contrast-processing-failed');
            }
        } else {
            preparedProposals.push({
                id: proposal.id,
                name: proposal.name,
                proposedColor: proposal.color,
                color: adjustment.color,
                colorAdjusted: adjustment.changed,
                contrastRatio: adjustment.ratio,
            });
        }
    }

    if (contrastErrors.size > 0) {
        return {
            status: 'contrast-rejected',
            proposals: [],
            errors: CONTRAST_ERROR_ORDER.filter(code => contrastErrors.has(code)),
        };
    }

    return {
        status: 'ready',
        proposals: preparedProposals,
    };
}