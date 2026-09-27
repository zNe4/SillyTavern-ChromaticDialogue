import { scanLegacyDialogue } from './legacy-dialogue-scanner.js';
import { normalizeState } from './domain.js';
import { getOrderedAssignmentEntries } from './registry.js';

/**
 * Standardized CSS hex color mappings for the ten accepted FF palette colors.
 *
 * @type {Readonly<Record<string, string>>}
 */
const FF_STANDARDIZED_COLORS = Object.freeze({
    cyan: '#00FFFF',
    pink: '#FFC0CB',
    teal: '#008080',
    orange: '#FFA500',
    gold: '#FFD700',
    violet: '#EE82EE',
    salmon: '#FA8072',
    orchid: '#DA70D6',
    yellow: '#FFFF00',
    plum: '#DDA0DD',
});

/**
 * Check whether a message entry has user role.
 *
 * @param {Record<string, unknown>} message
 * @returns {boolean}
 */
function isUserMessage(message) {
    return message.is_user === true;
}

/**
 * Check whether a message entry has system role.
 *
 * @param {Record<string, unknown>} message
 * @returns {boolean}
 */
function isSystemMessage(message) {
    return message.is_system === true;
}

/**
 * Determine the chat role for a message object.
 *
 * @param {Record<string, unknown>} message
 * @returns {'system' | 'user' | 'assistant'}
 */
function resolveMessageRole(message) {
    if (isSystemMessage(message)) {
        return 'system';
    }

    if (isUserMessage(message)) {
        return 'user';
    }

    return 'assistant';
}

/**
 * Determine the suggested final hex color for a source entry.
 *
 * @param {'named' | 'hex'} sourceType
 * @param {string} sourceValue
 * @returns {string | null}
 */
function resolveSuggestedFinalColor(sourceType, sourceValue) {
    if (sourceType === 'hex') {
        return sourceValue;
    }

    if (sourceType === 'named') {
        const lower = sourceValue.toLowerCase();
        return FF_STANDARDIZED_COLORS[lower] || null;
    }

    return null;
}

/**
 * Build a read-only chat-level inventory of legacy colored dialogue markup.
 *
 * @param {unknown} chat
 * @param {unknown} state
 * @param {Record<string, unknown>} [options={}]
 * @returns {{
 *     status: 'ready' | 'invalid-chat' | 'unsupported-state',
 *     includeIntroduction: boolean,
 *     occurrences: Array<object>,
 *     groups: Array<object>,
 *     issues: Array<object>,
 *     skippedMessages: Array<object>,
 *     existingAssignments: Array<{ id: string, name: string, color: string }>,
 *     stats: {
 *         messageCount: number,
 *         scannedMessageCount: number,
 *         skippedMessageCount: number,
 *         occurrenceCount: number,
 *         migratableCount: number,
 *         unknownColoredCount: number,
 *         issueCount: number,
 *         sourceGroupCount: number,
 *     },
 * }}
 */
export function buildLegacyChatInventory(chat, state, options = {}) {
    const includeIntroduction = options?.includeIntroduction === true;

    if (!Array.isArray(chat)) {
        return {
            status: 'invalid-chat',
            includeIntroduction,
            occurrences: [],
            groups: [],
            issues: [],
            skippedMessages: [],
            existingAssignments: [],
            stats: {
                messageCount: 0,
                scannedMessageCount: 0,
                skippedMessageCount: 0,
                occurrenceCount: 0,
                migratableCount: 0,
                unknownColoredCount: 0,
                issueCount: 0,
                sourceGroupCount: 0,
            },
        };
    }

    const normalizedState = normalizeState(state);

    if (normalizedState === null) {
        return {
            status: 'unsupported-state',
            includeIntroduction,
            occurrences: [],
            groups: [],
            issues: [],
            skippedMessages: [],
            existingAssignments: [],
            stats: {
                messageCount: chat.length,
                scannedMessageCount: 0,
                skippedMessageCount: 0,
                occurrenceCount: 0,
                migratableCount: 0,
                unknownColoredCount: 0,
                issueCount: 0,
                sourceGroupCount: 0,
            },
        };
    }

    const rawOrderedEntries = getOrderedAssignmentEntries(normalizedState);
    const existingAssignments = rawOrderedEntries.map(([id, assignment]) => ({
        id,
        name: assignment.name,
        color: assignment.color,
    }));

    const occurrences = [];
    const chatIssues = [];
    const skippedMessages = [];
    let scannedMessageCount = 0;

    for (let index = 0; index < chat.length; index += 1) {
        const item = chat[index];

        if (item === null || typeof item !== 'object' || Array.isArray(item)) {
            skippedMessages.push({
                messageIndex: index,
                role: null,
                reason: 'invalid-message',
            });
            continue;
        }

        const role = resolveMessageRole(item);

        if (role === 'system') {
            skippedMessages.push({
                messageIndex: index,
                role: 'system',
                reason: 'system-message',
            });
            continue;
        }

        if (typeof item.mes !== 'string') {
            skippedMessages.push({
                messageIndex: index,
                role,
                reason: 'invalid-message',
            });
            continue;
        }

        if (index === 0 && role === 'assistant' && !includeIntroduction) {
            skippedMessages.push({
                messageIndex: index,
                role: 'assistant',
                reason: 'intro-message',
            });
            continue;
        }

        scannedMessageCount += 1;
        const scanResult = scanLegacyDialogue(item.mes);

        for (const candidate of scanResult.candidates) {
            occurrences.push({
                messageIndex: index,
                role,
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

        for (const issue of scanResult.issues) {
            chatIssues.push({
                messageIndex: index,
                role,
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

    occurrences.sort((a, b) => {
        if (a.messageIndex !== b.messageIndex) {
            return a.messageIndex - b.messageIndex;
        }
        if (a.range.start !== b.range.start) {
            return a.range.start - b.range.start;
        }
        return a.range.end - b.range.end;
    });

    chatIssues.sort((a, b) => {
        if (a.messageIndex !== b.messageIndex) {
            return a.messageIndex - b.messageIndex;
        }
        if (a.range.start !== b.range.start) {
            return a.range.start - b.range.start;
        }
        if (a.range.end !== b.range.end) {
            return a.range.end - b.range.end;
        }
        return a.code.localeCompare(b.code);
    });

    const groupsMap = new Map();

    for (const occ of occurrences) {
        let groupRecord = groupsMap.get(occ.sourceKey);
        if (!groupRecord) {
            groupRecord = {
                sourceKey: occ.sourceKey,
                sourceType: occ.sourceType,
                sourceValue: occ.sourceValue,
                occurrences: [],
                adaptersSet: new Set(),
                messageIndexesSet: new Set(),
                firstMessageIndex: occ.messageIndex,
                firstRangeStart: occ.range.start,
            };
            groupsMap.set(occ.sourceKey, groupRecord);
        }

        groupRecord.occurrences.push(occ);
        groupRecord.adaptersSet.add(occ.adapter);
        groupRecord.messageIndexesSet.add(occ.messageIndex);
    }

    const groupRecords = Array.from(groupsMap.values());

    groupRecords.sort((a, b) => {
        if (a.firstMessageIndex !== b.firstMessageIndex) {
            return a.firstMessageIndex - b.firstMessageIndex;
        }
        if (a.firstRangeStart !== b.firstRangeStart) {
            return a.firstRangeStart - b.firstRangeStart;
        }
        return a.sourceKey.localeCompare(b.sourceKey);
    });

    const groups = groupRecords.map((record) => {
        let migratableCount = 0;
        let unknownColoredCount = 0;

        for (const occ of record.occurrences) {
            if (occ.migratable === true) {
                migratableCount += 1;
            }
            if (occ.classification === 'unknown-colored-content') {
                unknownColoredCount += 1;
            }
        }

        const messageIndexes = Array.from(record.messageIndexesSet).sort((a, b) => a - b);
        const adapters = Array.from(record.adaptersSet);

        const samples = record.occurrences.slice(0, 3).map((occ) => ({
            messageIndex: occ.messageIndex,
            role: occ.role,
            content: occ.content,
            tone: occ.tone,
            classification: occ.classification,
        }));

        const suggestedFinalColor = resolveSuggestedFinalColor(record.sourceType, record.sourceValue);
        const comparisonColor = suggestedFinalColor;

        let existingColorMatches = [];
        let suggestedAssignmentId = null;

        if (comparisonColor !== null) {
            existingColorMatches = existingAssignments
                .filter((assignment) => assignment.color === comparisonColor)
                .map((assignment) => ({
                    id: assignment.id,
                    name: assignment.name,
                    color: assignment.color,
                }));

            if (existingColorMatches.length === 1) {
                suggestedAssignmentId = existingColorMatches[0].id;
            }
        }

        return {
            sourceKey: record.sourceKey,
            sourceType: record.sourceType,
            sourceValue: record.sourceValue,
            occurrenceCount: record.occurrences.length,
            migratableCount,
            unknownColoredCount,
            adapters,
            messageIndexes,
            samples,
            existingColorMatches,
            suggestedAssignmentId,
            suggestedFinalColor,
        };
    });

    let totalMigratableCount = 0;
    let totalUnknownColoredCount = 0;

    for (const occ of occurrences) {
        if (occ.migratable === true) {
            totalMigratableCount += 1;
        }
        if (occ.classification === 'unknown-colored-content') {
            totalUnknownColoredCount += 1;
        }
    }

    return {
        status: 'ready',
        includeIntroduction,
        occurrences,
        groups,
        issues: chatIssues,
        skippedMessages,
        existingAssignments,
        stats: {
            messageCount: chat.length,
            scannedMessageCount,
            skippedMessageCount: skippedMessages.length,
            occurrenceCount: occurrences.length,
            migratableCount: totalMigratableCount,
            unknownColoredCount: totalUnknownColoredCount,
            issueCount: chatIssues.length,
            sourceGroupCount: groups.length,
        },
    };
}