import { CHAT_CONTENT_SELECTOR } from './constants.js';

const DEFAULT_MINIMUM_CONTRAST = 4.5;
const THEME_BACKGROUND_VARIABLES = [
    '--SmartThemeBlurTintColor',
    '--SmartThemeChatTintColor',
];

/**
 * Parse a numeric channel string (0-255 or percentage) and clamp to [0, 255].
 *
 * @param {string} str
 * @returns {number | null}
 */
function parseChannel(str) {
    if (typeof str !== 'string' || !str) {
        return null;
    }

    if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:%)?$/.test(str)) {
        return null;
    }

    let val;
    if (str.endsWith('%')) {
        val = (parseFloat(str) / 100) * 255;
    } else {
        val = parseFloat(str);
    }

    if (!Number.isFinite(val)) {
        return null;
    }

    return Math.min(255, Math.max(0, Math.round(val)));
}

/**
 * Parse an sRGB channel string used by color(srgb ...).
 * Numeric values use the CSS 0-1 scale; percentages use 0-100%.
 *
 * @param {string} str
 * @returns {number | null}
 */
function parseSrgbChannel(str) {
    if (typeof str !== 'string' || !str) {
        return null;
    }

    if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:%)?$/.test(str)) {
        return null;
    }

    let val;
    if (str.endsWith('%')) {
        val = parseFloat(str) / 100;
    } else {
        val = parseFloat(str);
    }

    if (!Number.isFinite(val)) {
        return null;
    }

    return Math.min(255, Math.max(0, Math.round(val * 255)));
}

/**
 * Parse an alpha channel string and validate strictly between 0 and 1 inclusive.
 *
 * @param {string} str
 * @returns {number | null}
 */
function parseAlpha(str) {
    if (typeof str !== 'string' || !str) {
        return null;
    }

    if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:%)?$/.test(str)) {
        return null;
    }

    let val;
    if (str.endsWith('%')) {
        val = parseFloat(str) / 100;
    } else {
        val = parseFloat(str);
    }

    if (!Number.isFinite(val) || val < 0 || val > 1) {
        return null;
    }

    return val;
}

/**
 * Parse a hex CSS color into RGBA channels.
 *
 * @param {string} colorStr
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
function parseHexColor(colorStr) {
    const match = colorStr.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (!match) {
        return null;
    }

    let hex = match[1];
    if (hex.length === 3 || hex.length === 4) {
        hex = hex.split('').map(char => `${char}${char}`).join('');
    }

    const hasAlpha = hex.length === 8;
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const a = hasAlpha ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;

    return { r, g, b, a };
}

/**
 * Parse a computed color string into an RGBA object.
 *
 * Supports:
 * - #RGB / #RGBA / #RRGGBB / #RRGGBBAA
 * - rgb(r, g, b)
 * - rgba(r, g, b, a)
 * - rgb(r g b)
 * - rgb(r g b / a)
 * - rgba(r g b / a)
 * - color(srgb r g b)
 * - color(srgb r g b / a)
 * - transparent
 *
 * @param {string} colorStr
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
function parseComputedColor(colorStr) {
    if (typeof colorStr !== 'string') {
        return null;
    }

    const trimmed = colorStr.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.toLowerCase() === 'transparent') {
        return { r: 0, g: 0, b: 0, a: 0 };
    }

    const parsedHex = parseHexColor(trimmed);
    if (parsedHex) {
        return parsedHex;
    }

    const srgbMatch = trimmed.match(/^color\(\s*srgb\s+(.+?)\s*\)$/i);
    if (srgbMatch) {
        const content = srgbMatch[1].trim();
        const slashParts = content.split('/');
        if (slashParts.length > 2) {
            return null;
        }

        const rgbParts = slashParts[0].trim().split(/\s+/);
        if (rgbParts.length !== 3) {
            return null;
        }

        const r = parseSrgbChannel(rgbParts[0]);
        const g = parseSrgbChannel(rgbParts[1]);
        const b = parseSrgbChannel(rgbParts[2]);
        if (r === null || g === null || b === null) {
            return null;
        }

        let a = 1;
        if (slashParts.length === 2) {
            a = parseAlpha(slashParts[1].trim());
            if (a === null) {
                return null;
            }
        }

        return { r, g, b, a };
    }

    const match = trimmed.match(/^rgba?\(\s*(.+?)\s*\)$/i);
    if (!match) {
        return null;
    }

    const content = match[1].trim();

    if (content.includes(',')) {
        const parts = content.split(',').map((p) => p.trim());
        if (parts.length !== 3 && parts.length !== 4) {
            return null;
        }

        const r = parseChannel(parts[0]);
        const g = parseChannel(parts[1]);
        const b = parseChannel(parts[2]);
        if (r === null || g === null || b === null) {
            return null;
        }

        let a = 1;
        if (parts.length === 4) {
            a = parseAlpha(parts[3]);
            if (a === null) {
                return null;
            }
        }

        return { r, g, b, a };
    }

    if (content.includes('/')) {
        const slashParts = content.split('/');
        if (slashParts.length !== 2) {
            return null;
        }

        const rgbParts = slashParts[0].trim().split(/\s+/);
        if (rgbParts.length !== 3) {
            return null;
        }

        const r = parseChannel(rgbParts[0]);
        const g = parseChannel(rgbParts[1]);
        const b = parseChannel(rgbParts[2]);
        if (r === null || g === null || b === null) {
            return null;
        }

        const a = parseAlpha(slashParts[1].trim());
        if (a === null) {
            return null;
        }

        return { r, g, b, a };
    }

    const spaceParts = content.split(/\s+/);
    if (spaceParts.length === 3) {
        const r = parseChannel(spaceParts[0]);
        const g = parseChannel(spaceParts[1]);
        const b = parseChannel(spaceParts[2]);
        if (r === null || g === null || b === null) {
            return null;
        }

        return { r, g, b, a: 1 };
    }

    return null;
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
    const toHex = (value) =>
        Math.min(255, Math.max(0, Math.round(value)))
            .toString(16)
            .padStart(2, '0')
            .toUpperCase();

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Collect candidate elements for background resolution in traversal order.
 *
 * @param {Element} startElement
 * @param {Document} doc
 * @returns {Element[]}
 */
function collectCandidates(startElement, doc) {
    const visited = new Set();
    const elements = [];

    let current = startElement;
    while (current && !visited.has(current)) {
        visited.add(current);
        elements.push(current);
        current = current.parentElement;
    }

    if (doc.documentElement && !visited.has(doc.documentElement)) {
        visited.add(doc.documentElement);
        elements.push(doc.documentElement);
    }

    if (doc.body && !visited.has(doc.body)) {
        visited.add(doc.body);
        elements.push(doc.body);
    }

    return elements;
}

/**
 * Read a representative opaque base from SillyTavern's inherited theme variables.
 *
 * This is used only when the rendered ancestor chain is fully transparent or
 * semi-transparent (for example, themes designed to reveal a wallpaper). The
 * tint RGB values remain the theme's intended chat-surface colors even when the
 * author intentionally gives them alpha.
 *
 * @param {Element[]} candidates
 * @returns {{ r: number, g: number, b: number, a: 1 } | null}
 */
function resolveThemeRepresentativeBase(candidates) {
    for (const element of candidates) {
        let computed;
        try {
            computed = globalThis.getComputedStyle(element);
        } catch {
            continue;
        }

        if (!computed || typeof computed.getPropertyValue !== 'function') {
            continue;
        }

        for (const propertyName of THEME_BACKGROUND_VARIABLES) {
            let rawValue = '';
            try {
                rawValue = computed.getPropertyValue(propertyName);
            } catch {
                continue;
            }

            const parsed = parseComputedColor(rawValue);
            if (!parsed || parsed.a === 0) {
                continue;
            }

            return {
                r: parsed.r,
                g: parsed.g,
                b: parsed.b,
                a: 1,
            };
        }
    }

    return null;
}

/**
 * Resolve effective chat background color and runtime options from the current DOM.
 *
 * @returns {{
 *     status: 'ready',
 *     options: {
 *         backgroundColor: string,
 *         minimumContrast: number,
 *     },
 * } | {
 *     status: 'unavailable',
 *     reason: 'dom-unavailable' | 'chat-element-missing' | 'background-unresolved',
 * }}
 */
export function resolveRuntimeOptions() {
    if (
        typeof globalThis.document === 'undefined' ||
        !globalThis.document ||
        typeof globalThis.document.querySelector !== 'function' ||
        typeof globalThis.getComputedStyle !== 'function'
    ) {
        return {
            status: 'unavailable',
            reason: 'dom-unavailable',
        };
    }

    const doc = globalThis.document;

    let startElement = null;
    try {
        startElement = doc.querySelector(CHAT_CONTENT_SELECTOR);
        if (!startElement) {
            startElement = doc.querySelector('#chat');
        }
    } catch {
        return {
            status: 'unavailable',
            reason: 'chat-element-missing',
        };
    }

    if (!startElement) {
        return {
            status: 'unavailable',
            reason: 'chat-element-missing',
        };
    }

    const candidates = collectCandidates(startElement, doc);
    const semiTransparentLayers = [];
    let opaqueBase = null;

    for (const element of candidates) {
        let bgStyle = null;
        try {
            const computed = globalThis.getComputedStyle(element);
            bgStyle = computed ? computed.backgroundColor : null;
        } catch {
            continue;
        }

        if (!bgStyle || typeof bgStyle !== 'string') {
            continue;
        }

        const parsed = parseComputedColor(bgStyle);
        if (!parsed) {
            continue;
        }

        if (parsed.a === 0) {
            continue;
        }

        if (parsed.a === 1) {
            opaqueBase = parsed;
            break;
        }

        semiTransparentLayers.push(parsed);
    }

    if (!opaqueBase) {
        opaqueBase = resolveThemeRepresentativeBase(candidates);
    }

    if (!opaqueBase) {
        return {
            status: 'unavailable',
            reason: 'background-unresolved',
        };
    }

    let r = opaqueBase.r;
    let g = opaqueBase.g;
    let b = opaqueBase.b;

    for (let i = semiTransparentLayers.length - 1; i >= 0; i--) {
        const layer = semiTransparentLayers[i];
        r = Math.round(layer.r * layer.a + r * (1 - layer.a));
        g = Math.round(layer.g * layer.a + g * (1 - layer.a));
        b = Math.round(layer.b * layer.a + b * (1 - layer.a));
    }

    return {
        status: 'ready',
        options: {
            backgroundColor: rgbToHex(r, g, b),
            minimumContrast: DEFAULT_MINIMUM_CONTRAST,
        },
    };
}
