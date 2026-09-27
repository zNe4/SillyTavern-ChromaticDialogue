import { normalizeHexColor } from './domain.js';
import { isSupportedDialogueTone } from './dialogue-syntax.js';

const FF_PALETTE = new Set([
    'cyan',
    'pink',
    'teal',
    'orange',
    'gold',
    'violet',
    'salmon',
    'orchid',
    'yellow',
    'plum',
]);

const ISSUE_CODE_ORDER = [
    'unsupported-tone',
    'overlaps-existing-cd',
    'overlapping-legacy-markup',
];

const CD_REGION_PATTERN = /\[(c(?:[1-9]|[1-9][0-9]))(?::(whisper|shout|measured|tremble))?\][\s\S]*?\[\/c\]/g;
const FF_OPEN_PATTERN = /<([a-zA-Z]+)(?::([^\s>]+))?>/g;
const FONT_OPEN_PATTERN = /<font\b([^>]*)>/gi;
const SPAN_OPEN_PATTERN = /<span\b([^>]*)>/gi;

const FONT_ATTRS_PATTERN = /^\s*color\s*=\s*(?:"(#?[0-9a-fA-F]{6})"|'(#?[0-9a-fA-F]{6})'|(#?[0-9a-fA-F]{6}))\s*$/i;
const SPAN_ATTRS_PATTERN = /^\s*style\s*=\s*(?:"\s*color\s*:\s*(#[0-9a-fA-F]{6})\s*;?\s*"|'\s*color\s*:\s*(#[0-9a-fA-F]{6})\s*;?\s*')\s*$/i;

/**
 * Escape a string for inclusion in a regular expression.
 *
 * @param {string} string
 * @returns {string}
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Determine whether two ranges [start, end) overlap.
 *
 * @param {{ start: number, end: number }} a
 * @param {{ start: number, end: number }} b
 * @returns {boolean}
 */
function rangesOverlap(a, b) {
    return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}

/**
 * Classify dialogue quotation markers for a legacy wrapper.
 *
 * @param {string} message
 * @param {number} openStart
 * @param {number} openEnd
 * @param {number} closeStart
 * @param {number} closeEnd
 * @returns {{
 *     start: number,
 *     end: number,
 *     content: string,
 *     quoteStyle: 'straight-double' | 'curly-double' | null,
 *     classification: 'spoken' | 'unknown-colored-content',
 *     migratable: boolean,
 * }}
 */
function classifyDialogueQuotes(message, openStart, openEnd, closeStart, closeEnd) {
    const inner = message.slice(openEnd, closeStart);

    if (inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2) {
        return {
            start: openStart,
            end: closeEnd,
            content: inner.slice(1, -1),
            quoteStyle: 'straight-double',
            classification: 'spoken',
            migratable: true,
        };
    }

    if (inner.startsWith('“') && inner.endsWith('”') && inner.length >= 2) {
        return {
            start: openStart,
            end: closeEnd,
            content: inner.slice(1, -1),
            quoteStyle: 'curly-double',
            classification: 'spoken',
            migratable: true,
        };
    }

    if (openStart > 0 && closeEnd < message.length) {
        const charBefore = message[openStart - 1];
        const charAfter = message[closeEnd];

        if (charBefore === '"' && charAfter === '"') {
            return {
                start: openStart - 1,
                end: closeEnd + 1,
                content: inner,
                quoteStyle: 'straight-double',
                classification: 'spoken',
                migratable: true,
            };
        }

        if (charBefore === '“' && charAfter === '”') {
            return {
                start: openStart - 1,
                end: closeEnd + 1,
                content: inner,
                quoteStyle: 'curly-double',
                classification: 'spoken',
                migratable: true,
            };
        }
    }

    return {
        start: openStart,
        end: closeEnd,
        content: inner,
        quoteStyle: null,
        classification: 'unknown-colored-content',
        migratable: false,
    };
}

/**
 * Scan a message string for legacy dialogue markup.
 *
 * @param {unknown} message
 * @returns {{
 *     status: 'ready' | 'invalid-message',
 *     candidates: Array<{
 *         adapter: 'ff-named-color' | 'html-font-color' | 'inline-css-color',
 *         sourceType: 'named' | 'hex',
 *         sourceValue: string,
 *         sourceKey: string,
 *         tone: string | null,
 *         classification: 'spoken' | 'unknown-colored-content',
 *         migratable: boolean,
 *         content: string,
 *         quoteStyle: 'straight-double' | 'curly-double' | null,
 *         raw: string,
 *         range: { start: number, end: number },
 *     }>,
 *     issues: Array<{
 *         code: 'unsupported-tone' | 'overlaps-existing-cd' | 'overlapping-legacy-markup',
 *         adapter: 'ff-named-color' | 'html-font-color' | 'inline-css-color',
 *         raw: string,
 *         range: { start: number, end: number },
 *     }>,
 * }}
 */
export function scanLegacyDialogue(message) {
    if (typeof message !== 'string') {
        return {
            status: 'invalid-message',
            candidates: [],
            issues: [],
        };
    }

    const cdRegions = [];
    const cdRegex = new RegExp(CD_REGION_PATTERN.source, CD_REGION_PATTERN.flags);
    let cdMatch;
    while ((cdMatch = cdRegex.exec(message)) !== null) {
        cdRegions.push({
            start: cdMatch.index,
            end: cdMatch.index + cdMatch[0].length,
        });
    }

    const candidateEntries = [];
    const issueEntries = [];
    const legacyWrapperRanges = [];

    // Adapter 1: Freaky Frankenstein named-color syntax
    const ffOpenRegex = new RegExp(FF_OPEN_PATTERN.source, FF_OPEN_PATTERN.flags);
    let ffMatch;
    while ((ffMatch = ffOpenRegex.exec(message)) !== null) {
        const colorLower = ffMatch[1].toLowerCase();
        if (!FF_PALETTE.has(colorLower)) {
            continue;
        }

        const openStart = ffMatch.index;
        const openEnd = ffMatch.index + ffMatch[0].length;
        const rawTone = ffMatch[2] ? ffMatch[2].toLowerCase() : null;

        const closePattern = rawTone !== null
            ? new RegExp(`</${colorLower}:${escapeRegex(rawTone)}\\s*>`, 'i')
            : new RegExp(`</${colorLower}\\s*>`, 'i');

        const sliceFromOpenEnd = message.slice(openEnd);
        const closeMatch = closePattern.exec(sliceFromOpenEnd);
        if (!closeMatch) {
            continue;
        }

        const closeStart = openEnd + closeMatch.index;
        const closeEnd = closeStart + closeMatch[0].length;

        legacyWrapperRanges.push({ start: openStart, end: closeEnd });

        if (rawTone !== null && !isSupportedDialogueTone(rawTone)) {
            issueEntries.push({
                code: 'unsupported-tone',
                adapter: 'ff-named-color',
                raw: message.slice(openStart, closeEnd),
                range: {
                    start: openStart,
                    end: closeEnd,
                },
            });
            continue;
        }

        const quoteInfo = classifyDialogueQuotes(message, openStart, openEnd, closeStart, closeEnd);
        const raw = message.slice(quoteInfo.start, quoteInfo.end);

        candidateEntries.push({
            adapter: 'ff-named-color',
            sourceType: 'named',
            sourceValue: colorLower,
            sourceKey: `named:${colorLower}`,
            tone: rawTone,
            classification: quoteInfo.classification,
            migratable: quoteInfo.migratable,
            content: quoteInfo.content,
            quoteStyle: quoteInfo.quoteStyle,
            raw,
            range: {
                start: quoteInfo.start,
                end: quoteInfo.end,
            },
        });
    }

    // Adapter 2: HTML font-color syntax
    const fontOpenRegex = new RegExp(FONT_OPEN_PATTERN.source, FONT_OPEN_PATTERN.flags);
    let fontMatch;
    while ((fontMatch = fontOpenRegex.exec(message)) !== null) {
        const attrs = fontMatch[1];
        const colorMatch = attrs.match(FONT_ATTRS_PATTERN);
        if (!colorMatch) {
            continue;
        }

        const rawColor = colorMatch[1] || colorMatch[2] || colorMatch[3];
        const hexCandidate = rawColor.startsWith('#') ? rawColor : `#${rawColor}`;
        const normalizedHex = normalizeHexColor(hexCandidate);
        if (!normalizedHex) {
            continue;
        }

        const openStart = fontMatch.index;
        const openEnd = fontMatch.index + fontMatch[0].length;

        const fontClosePattern = /<\/font\s*>/i;
        const sliceFromOpenEnd = message.slice(openEnd);
        const closeMatch = fontClosePattern.exec(sliceFromOpenEnd);
        if (!closeMatch) {
            continue;
        }

        const closeStart = openEnd + closeMatch.index;
        const closeEnd = closeStart + closeMatch[0].length;

        legacyWrapperRanges.push({ start: openStart, end: closeEnd });

        const quoteInfo = classifyDialogueQuotes(message, openStart, openEnd, closeStart, closeEnd);
        const raw = message.slice(quoteInfo.start, quoteInfo.end);

        candidateEntries.push({
            adapter: 'html-font-color',
            sourceType: 'hex',
            sourceValue: normalizedHex,
            sourceKey: `hex:${normalizedHex}`,
            tone: null,
            classification: quoteInfo.classification,
            migratable: quoteInfo.migratable,
            content: quoteInfo.content,
            quoteStyle: quoteInfo.quoteStyle,
            raw,
            range: {
                start: quoteInfo.start,
                end: quoteInfo.end,
            },
        });
    }

    // Adapter 3: DEM inline-CSS color spans
    const spanOpenRegex = new RegExp(SPAN_OPEN_PATTERN.source, SPAN_OPEN_PATTERN.flags);
    let spanMatch;
    while ((spanMatch = spanOpenRegex.exec(message)) !== null) {
        const attrs = spanMatch[1];
        const colorMatch = attrs.match(SPAN_ATTRS_PATTERN);
        if (!colorMatch) {
            continue;
        }

        const rawColor = colorMatch[1] || colorMatch[2];
        const normalizedHex = normalizeHexColor(rawColor);
        if (!normalizedHex) {
            continue;
        }

        const openStart = spanMatch.index;
        const openEnd = spanMatch.index + spanMatch[0].length;

        const spanClosePattern = /<\/span\s*>/i;
        const sliceFromOpenEnd = message.slice(openEnd);
        const closeMatch = spanClosePattern.exec(sliceFromOpenEnd);
        if (!closeMatch) {
            continue;
        }

        const closeStart = openEnd + closeMatch.index;
        const closeEnd = closeStart + closeMatch[0].length;

        legacyWrapperRanges.push({ start: openStart, end: closeEnd });

        const quoteInfo = classifyDialogueQuotes(message, openStart, openEnd, closeStart, closeEnd);
        const raw = message.slice(quoteInfo.start, quoteInfo.end);

        candidateEntries.push({
            adapter: 'inline-css-color',
            sourceType: 'hex',
            sourceValue: normalizedHex,
            sourceKey: `hex:${normalizedHex}`,
            tone: null,
            classification: quoteInfo.classification,
            migratable: quoteInfo.migratable,
            content: quoteInfo.content,
            quoteStyle: quoteInfo.quoteStyle,
            raw,
            range: {
                start: quoteInfo.start,
                end: quoteInfo.end,
            },
        });
    }

    const nonCdCandidates = [];

    for (const candidate of candidateEntries) {
        let overlapsCd = false;
        for (const cd of cdRegions) {
            if (rangesOverlap(candidate.range, cd)) {
                overlapsCd = true;
                break;
            }
        }

        if (overlapsCd) {
            issueEntries.push({
                code: 'overlaps-existing-cd',
                adapter: candidate.adapter,
                raw: candidate.raw,
                range: {
                    start: candidate.range.start,
                    end: candidate.range.end,
                },
            });
        } else {
            nonCdCandidates.push(candidate);
        }
    }

    const overlappingIndices = new Set();
    for (let i = 0; i < nonCdCandidates.length; i += 1) {
        for (let j = i + 1; j < nonCdCandidates.length; j += 1) {
            if (rangesOverlap(nonCdCandidates[i].range, nonCdCandidates[j].range)) {
                overlappingIndices.add(i);
                overlappingIndices.add(j);
            }
        }
    }

    const finalCandidates = [];
    for (let i = 0; i < nonCdCandidates.length; i += 1) {
        const candidate = nonCdCandidates[i];
        if (overlappingIndices.has(i)) {
            issueEntries.push({
                code: 'overlapping-legacy-markup',
                adapter: candidate.adapter,
                raw: candidate.raw,
                range: {
                    start: candidate.range.start,
                    end: candidate.range.end,
                },
            });
        } else {
            finalCandidates.push({
                adapter: candidate.adapter,
                sourceType: candidate.sourceType,
                sourceValue: candidate.sourceValue,
                sourceKey: candidate.sourceKey,
                tone: candidate.tone,
                classification: candidate.classification,
                migratable: candidate.migratable,
                content: candidate.content,
                quoteStyle: candidate.quoteStyle,
                raw: candidate.raw,
                range: {
                    start: candidate.range.start,
                    end: candidate.range.end,
                },
            });
        }
    }

    finalCandidates.sort((a, b) => {
        if (a.range.start !== b.range.start) {
            return a.range.start - b.range.start;
        }
        return a.range.end - b.range.end;
    });

    const uniqueIssues = [];
    const seenIssueKeys = new Set();

    for (const issue of issueEntries) {
        const key = `${issue.code}:${issue.adapter}:${issue.range.start}:${issue.range.end}`;
        if (!seenIssueKeys.has(key)) {
            seenIssueKeys.add(key);
            uniqueIssues.push({
                code: issue.code,
                adapter: issue.adapter,
                raw: issue.raw,
                range: {
                    start: issue.range.start,
                    end: issue.range.end,
                },
            });
        }
    }

    uniqueIssues.sort((a, b) => {
        if (a.range.start !== b.range.start) {
            return a.range.start - b.range.start;
        }
        if (a.range.end !== b.range.end) {
            return a.range.end - b.range.end;
        }
        const aCodeIndex = ISSUE_CODE_ORDER.indexOf(a.code);
        const bCodeIndex = ISSUE_CODE_ORDER.indexOf(b.code);
        if (aCodeIndex !== bCodeIndex) {
            return aCodeIndex - bCodeIndex;
        }
        return a.adapter.localeCompare(b.adapter);
    });

    return {
        status: 'ready',
        candidates: finalCandidates,
        issues: uniqueIssues,
    };
}
