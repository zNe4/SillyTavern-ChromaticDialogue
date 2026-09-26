import { normalizeHexColor } from './domain.js';

/**
 * Convert a normalized 6-digit hex color to RGB tuple.
 *
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function hexToRgb(hex) {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}

/**
 * Convert RGB channel values (0-255) to a canonical uppercase 6-digit hex color.
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
function rgbToHex(r, g, b) {
    const toHex = (value) => value.toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert an 8-bit channel (0-255) to its linear sRGB value.
 *
 * @param {number} channel
 * @returns {number}
 */
function linearizeChannel(channel) {
    const sRGB = channel / 255;
    return sRGB <= 0.04045
        ? sRGB / 12.92
        : Math.pow((sRGB + 0.055) / 1.055, 2.4);
}

/**
 * Interpolate a single color channel from C toward target T.
 *
 * @param {number} c
 * @param {number} t
 * @param {number} fraction
 * @returns {number}
 */
function interpolateChannel(c, t, fraction) {
    return Math.min(255, Math.max(0, Math.round(c + (t - c) * fraction)));
}

/**
 * Calculate the squared Euclidean RGB distance between two colors.
 *
 * @param {[number, number, number]} rgb1
 * @param {[number, number, number]} rgb2
 * @returns {number}
 */
function calculateRgbDistanceSquared(rgb1, rgb2) {
    return (
        (rgb1[0] - rgb2[0]) ** 2 +
        (rgb1[1] - rgb2[1]) ** 2 +
        (rgb1[2] - rgb2[2]) ** 2
    );
}

/**
 * Validate that minimumRatio is a finite number between 1 and 21 inclusive.
 *
 * @param {unknown} value
 * @returns {value is number}
 */
function isValidMinimumRatio(value) {
    return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 1 &&
        value <= 21
    );
}

/**
 * Calculate relative luminance of a color according to the WCAG definition.
 *
 * @param {unknown} color
 * @returns {number | null}
 */
export function getRelativeLuminance(color) {
    const hex = normalizeHexColor(color);
    if (!hex) {
        return null;
    }

    const [r, g, b] = hexToRgb(hex);

    return (
        0.2126 * linearizeChannel(r) +
        0.7152 * linearizeChannel(g) +
        0.0722 * linearizeChannel(b)
    );
}

/**
 * Calculate the WCAG contrast ratio between two colors.
 *
 * @param {unknown} foreground
 * @param {unknown} background
 * @returns {number | null}
 */
export function getContrastRatio(foreground, background) {
    const lForeground = getRelativeLuminance(foreground);
    const lBackground = getRelativeLuminance(background);

    if (lForeground === null || lBackground === null) {
        return null;
    }

    const lighter = Math.max(lForeground, lBackground);
    const darker = Math.min(lForeground, lBackground);

    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Determine whether foreground and background meet a target contrast ratio.
 *
 * @param {unknown} foreground
 * @param {unknown} background
 * @param {number} [minimumRatio=4.5]
 * @returns {boolean}
 */
export function meetsContrastRequirement(foreground, background, minimumRatio = 4.5) {
    if (!isValidMinimumRatio(minimumRatio)) {
        return false;
    }

    const ratio = getContrastRatio(foreground, background);
    if (ratio === null) {
        return false;
    }

    return ratio >= minimumRatio;
}

/**
 * Select the optimal candidate between lighter and darker passing repairs.
 *
 * @param {{ color: string, ratio: number, distance: number, direction: 'lighter' } | null} lighter
 * @param {{ color: string, ratio: number, distance: number, direction: 'darker' } | null} darker
 * @returns {{ color: string, ratio: number, distance: number, direction: 'lighter' | 'darker' } | null}
 */
function chooseCandidate(lighter, darker) {
    if (lighter && !darker) {
        return lighter;
    }
    if (!lighter && darker) {
        return darker;
    }
    if (lighter && darker) {
        if (lighter.distance < darker.distance) {
            return lighter;
        }
        if (darker.distance < lighter.distance) {
            return darker;
        }
        if (lighter.ratio > darker.ratio) {
            return lighter;
        }
        if (darker.ratio > lighter.ratio) {
            return darker;
        }
        return lighter;
    }
    return null;
}

/**
 * Verify and, if necessary, deterministically adjust a foreground color to meet contrast requirements.
 *
 * @param {unknown} foreground
 * @param {unknown} background
 * @param {number} [minimumRatio=4.5]
 * @returns {{
 *     ok: boolean,
 *     color: string | null,
 *     ratio: number | null,
 *     changed: boolean,
 *     direction: 'none' | 'lighter' | 'darker' | null,
 *     error: null | 'invalid-foreground' | 'invalid-background' | 'invalid-minimum-ratio' | 'unreachable',
 * }}
 */
export function adjustColorForContrast(foreground, background, minimumRatio = 4.5) {
    const normFg = normalizeHexColor(foreground);
    if (!normFg) {
        return {
            ok: false,
            color: null,
            ratio: null,
            changed: false,
            direction: null,
            error: 'invalid-foreground',
        };
    }

    const normBg = normalizeHexColor(background);
    if (!normBg) {
        return {
            ok: false,
            color: null,
            ratio: null,
            changed: false,
            direction: null,
            error: 'invalid-background',
        };
    }

    if (!isValidMinimumRatio(minimumRatio)) {
        return {
            ok: false,
            color: null,
            ratio: null,
            changed: false,
            direction: null,
            error: 'invalid-minimum-ratio',
        };
    }

    const currentRatio = getContrastRatio(normFg, normBg);
    if (currentRatio !== null && currentRatio >= minimumRatio) {
        return {
            ok: true,
            color: normFg,
            ratio: currentRatio,
            changed: false,
            direction: 'none',
            error: null,
        };
    }

    const origRgb = hexToRgb(normFg);

    let lighterCandidate = null;
    for (let step = 1; step <= 255; step++) {
        const fraction = step / 255;
        const candidateRgb = [
            interpolateChannel(origRgb[0], 255, fraction),
            interpolateChannel(origRgb[1], 255, fraction),
            interpolateChannel(origRgb[2], 255, fraction),
        ];
        const candidateHex = rgbToHex(candidateRgb[0], candidateRgb[1], candidateRgb[2]);
        const ratio = getContrastRatio(candidateHex, normBg);

        if (ratio !== null && ratio >= minimumRatio) {
            lighterCandidate = {
                color: candidateHex,
                ratio,
                distance: calculateRgbDistanceSquared(candidateRgb, origRgb),
                direction: 'lighter',
            };
            break;
        }
    }

    let darkerCandidate = null;
    for (let step = 1; step <= 255; step++) {
        const fraction = step / 255;
        const candidateRgb = [
            interpolateChannel(origRgb[0], 0, fraction),
            interpolateChannel(origRgb[1], 0, fraction),
            interpolateChannel(origRgb[2], 0, fraction),
        ];
        const candidateHex = rgbToHex(candidateRgb[0], candidateRgb[1], candidateRgb[2]);
        const ratio = getContrastRatio(candidateHex, normBg);

        if (ratio !== null && ratio >= minimumRatio) {
            darkerCandidate = {
                color: candidateHex,
                ratio,
                distance: calculateRgbDistanceSquared(candidateRgb, origRgb),
                direction: 'darker',
            };
            break;
        }
    }

    const chosen = chooseCandidate(lighterCandidate, darkerCandidate);
    if (!chosen) {
        return {
            ok: false,
            color: null,
            ratio: null,
            changed: false,
            direction: null,
            error: 'unreachable',
        };
    }

    return {
        ok: true,
        color: chosen.color,
        ratio: chosen.ratio,
        changed: true,
        direction: chosen.direction,
        error: null,
    };
}