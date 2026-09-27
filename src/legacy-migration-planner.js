import { buildLegacyChatInventory } from './legacy-chat-inventory.js';
import {
    isValidAssignmentId,
    normalizeHexColor,
    normalizeName,
    normalizeStateForWrite,
} from './domain.js';
import {
    getNextFreeAssignmentId,
    getOrderedAssignmentEntries,
} from './registry.js';

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
 * Perform a deep structural equality comparison.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
    if (a === b) {
        return true;
    }

    if (
        a === null ||
        typeof a !== 'object' ||
        b === null ||
        typeof b !== 'object'
    ) {
        return false;
    }

    if (Array.isArray(a) !== Array.isArray(b)) {
        return false;
    }

    if (Array.isArray(a)) {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i += 1) {
            if (!deepEqual(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) {
        return false;
    }

    for (const key of keysA) {
        if (
            !Object.prototype.hasOwnProperty.call(b, key) ||
            !deepEqual(a[key], b[key])
        ) {
            return false;
        }
    }

    return true;
}

/**
 * Build a canonical failure response.
 *
 * @param {string} status
 * @param {Array<{ code: string, sourceKey: string | null }>} errors
 * @returns {object}
 */
function createFailureResult(status, errors) {
    return {
        status,
        errors,
        sourcePlans: [],
        newAssignments: [],
        reusedAssignments: [],
        messageChanges: [],
        plannedState: null,
        stats: null,
    };
}

/**
 * Determine the chat role for a message object.
 *
 * @param {Record<string, unknown>} message
 * @returns {'system' | 'user' | 'assistant'}
 */
function resolveMessageRole(message) {
    if (message.is_system === true) {
        return 'system';
    }
    if (message.is_user === true) {
        return 'user';
    }
    return 'assistant';
}

/**
 * Validate human mapping decisions and plan a non-destructive chat migration.
 *
 * @param {unknown} chat
 * @param {unknown} state
 * @param {unknown} inventory
 * @param {unknown} mappings
 * @returns {object}
 */
export function planLegacyMigration(chat, state, inventory, mappings) {
    if (!Array.isArray(chat)) {
        return createFailureResult('invalid-chat', [
            {
                code: 'invalid-chat',
                sourceKey: null,
            },
        ]);
    }

    const normalizedCurrentState = normalizeStateForWrite(state);
    if (normalizedCurrentState === null) {
        return createFailureResult('invalid-state', [
            {
                code: 'invalid-state',
                sourceKey: null,
            },
        ]);
    }

    const existingEntries = getOrderedAssignmentEntries(normalizedCurrentState);

    if (
        !isPlainObject(inventory) ||
        inventory.status !== 'ready' ||
        typeof inventory.includeIntroduction !== 'boolean' ||
        !Array.isArray(inventory.occurrences) ||
        !Array.isArray(inventory.groups) ||
        !Array.isArray(inventory.existingAssignments) ||
        !Array.isArray(inventory.issues) ||
        !Array.isArray(inventory.skippedMessages) ||
        !isPlainObject(inventory.stats)
    ) {
        return createFailureResult('invalid-inventory', [
            {
                code: 'invalid-inventory',
                sourceKey: null,
            },
        ]);
    }

    const currentInventory = buildLegacyChatInventory(
        chat,
        normalizedCurrentState,
        {
            includeIntroduction: inventory.includeIntroduction === true,
        },
    );

    if (currentInventory.status !== 'ready') {
        return createFailureResult('stale-inventory', [
            {
                code: 'stale-inventory',
                sourceKey: null,
            },
        ]);
    }

    const inventoryFields = [
        'status',
        'includeIntroduction',
        'occurrences',
        'groups',
        'issues',
        'skippedMessages',
        'existingAssignments',
        'stats',
    ];

    for (const field of inventoryFields) {
        if (!deepEqual(currentInventory[field], inventory[field])) {
            return createFailureResult('stale-inventory', [
                {
                    code: 'stale-inventory',
                    sourceKey: null,
                },
            ]);
        }
    }

    for (const occ of inventory.occurrences) {
        const item = chat[occ.messageIndex];
        if (
            !isPlainObject(item) ||
            typeof item.mes !== 'string' ||
            item.mes.slice(occ.range.start, occ.range.end) !== occ.raw
        ) {
            return createFailureResult('stale-inventory', [
                {
                    code: 'stale-inventory',
                    sourceKey: null,
                },
            ]);
        }
    }

    if (!Array.isArray(mappings)) {
        return createFailureResult('invalid-mappings', [
            {
                code: 'invalid-mappings',
                sourceKey: null,
            },
        ]);
    }

    const inventoryGroupsMap = new Map();
    for (const grp of inventory.groups) {
        inventoryGroupsMap.set(grp.sourceKey, grp);
    }

    const errors = [];
    const seenSourceKeysInMappings = new Set();
    const validMappingsBySourceKey = new Map();

    for (const mapping of mappings) {
        if (!isPlainObject(mapping)) {
            errors.push({ code: 'invalid-mapping', sourceKey: null });
            continue;
        }

        if (typeof mapping.sourceKey !== 'string') {
            errors.push({ code: 'invalid-mapping', sourceKey: null });
            continue;
        }

        const sourceKey = mapping.sourceKey;

        if (seenSourceKeysInMappings.has(sourceKey)) {
            errors.push({ code: 'duplicate-source-mapping', sourceKey });
            continue;
        }
        seenSourceKeysInMappings.add(sourceKey);

        if (!inventoryGroupsMap.has(sourceKey)) {
            errors.push({ code: 'unknown-source-key', sourceKey });
            continue;
        }

        const targetGroup = inventoryGroupsMap.get(sourceKey);
        if (targetGroup.migratableCount === 0) {
            errors.push({ code: 'source-not-migratable', sourceKey });
            continue;
        }

        if (typeof mapping.action !== 'string') {
            errors.push({ code: 'invalid-mapping', sourceKey });
            continue;
        }

        if (!['reuse', 'create', 'skip'].includes(mapping.action)) {
            errors.push({ code: 'invalid-action', sourceKey });
            continue;
        }

        const keys = Object.keys(mapping);

        if (mapping.action === 'skip') {
            const allowed = new Set(['sourceKey', 'action']);
            if (keys.some((k) => !allowed.has(k))) {
                errors.push({ code: 'invalid-mapping', sourceKey });
                continue;
            }

            validMappingsBySourceKey.set(sourceKey, {
                sourceKey,
                action: 'skip',
            });
        } else if (mapping.action === 'reuse') {
            const allowed = new Set(['sourceKey', 'action', 'assignmentId']);
            if (keys.some((k) => !allowed.has(k))) {
                errors.push({ code: 'invalid-mapping', sourceKey });
                continue;
            }

            if (!isValidAssignmentId(mapping.assignmentId)) {
                errors.push({ code: 'invalid-assignment-id', sourceKey });
                continue;
            }

            if (
                !Object.prototype.hasOwnProperty.call(
                    normalizedCurrentState.assignments,
                    mapping.assignmentId,
                )
            ) {
                errors.push({ code: 'assignment-not-found', sourceKey });
                continue;
            }

            validMappingsBySourceKey.set(sourceKey, {
                sourceKey,
                action: 'reuse',
                assignmentId: mapping.assignmentId,
            });
        } else if (mapping.action === 'create') {
            const allowed = new Set(['sourceKey', 'action', 'name', 'color']);
            if (keys.some((k) => !allowed.has(k))) {
                errors.push({ code: 'invalid-mapping', sourceKey });
                continue;
            }

            let entryValid = true;
            const normName = normalizeName(mapping.name);
            if (!normName) {
                errors.push({ code: 'invalid-name', sourceKey });
                entryValid = false;
            }

            const normColor = normalizeHexColor(mapping.color);
            if (!normColor) {
                errors.push({ code: 'invalid-color', sourceKey });
                entryValid = false;
            }

            if (normName) {
                const foldedName = normName.toLowerCase();
                const collision = Object.values(
                    normalizedCurrentState.assignments,
                ).some(
                    (a) => normalizeName(a.name)?.toLowerCase() === foldedName,
                );

                if (collision) {
                    errors.push({ code: 'name-already-assigned', sourceKey });
                    entryValid = false;
                }
            }

            if (entryValid) {
                validMappingsBySourceKey.set(sourceKey, {
                    sourceKey,
                    action: 'create',
                    name: normName,
                    color: normColor,
                });
            }
        }
    }

    for (const group of inventory.groups) {
        if (group.migratableCount > 0) {
            if (!seenSourceKeysInMappings.has(group.sourceKey)) {
                errors.push({
                    code: 'missing-mapping',
                    sourceKey: group.sourceKey,
                });
            }
        }
    }

    const uniqueNewCharactersByName = new Map();
    for (const group of inventory.groups) {
        const mapping = validMappingsBySourceKey.get(group.sourceKey);
        if (!mapping || mapping.action !== 'create') {
            continue;
        }

        const foldedName = mapping.name.toLowerCase();
        const existing = uniqueNewCharactersByName.get(foldedName);

        if (!existing) {
            uniqueNewCharactersByName.set(foldedName, {
                sourceKey: group.sourceKey,
                color: mapping.color,
                spelling: mapping.name,
            });
        } else {
            if (existing.color !== mapping.color) {
                errors.push({
                    code: 'conflicting-new-character-color',
                    sourceKey: group.sourceKey,
                });
            }
        }
    }

    const availableCapacity = 99 - existingEntries.length;

    if (uniqueNewCharactersByName.size > availableCapacity) {
        errors.push({
            code: 'registry-capacity-exceeded',
            sourceKey: null,
        });
    }

    if (errors.length > 0) {
        return createFailureResult('invalid-mappings', errors);
    }

    const allocationState = {
        schemaVersion: normalizedCurrentState.schemaVersion,
        assignments: {},
    };

    for (const [id, assignment] of existingEntries) {
        allocationState.assignments[id] = {
            name: assignment.name,
            color: assignment.color,
        };
    }

    const allocatedCharactersByName = new Map();
    const newAssignments = [];

    for (const group of inventory.groups) {
        const mapping = validMappingsBySourceKey.get(group.sourceKey);
        if (!mapping || mapping.action !== 'create') {
            continue;
        }

        const foldedName = mapping.name.toLowerCase();
        if (!allocatedCharactersByName.has(foldedName)) {
            const allocatedId = getNextFreeAssignmentId(allocationState);

            if (!allocatedId) {
                return createFailureResult('invalid-mappings', [
                    {
                        code: 'registry-capacity-exceeded',
                        sourceKey: null,
                    },
                ]);
            }

            const primarySpelling = uniqueNewCharactersByName.get(foldedName).spelling;
            const charRecord = {
                id: allocatedId,
                name: primarySpelling,
                color: mapping.color,
            };

            allocationState.assignments[allocatedId] = {
                name: charRecord.name,
                color: charRecord.color,
            };

            allocatedCharactersByName.set(foldedName, charRecord);
            newAssignments.push(charRecord);
        }
    }

    const sourcePlans = [];
    const sourcePlanBySourceKey = new Map();

    for (const group of inventory.groups) {
        if (group.migratableCount <= 0) {
            continue;
        }

        const mapping = validMappingsBySourceKey.get(group.sourceKey);
        let planEntry;

        if (mapping.action === 'skip') {
            planEntry = {
                sourceKey: group.sourceKey,
                action: 'skip',
                assignmentId: null,
                name: null,
                color: null,
                migratableCount: group.migratableCount,
                unknownColoredCount: group.unknownColoredCount,
            };
        } else if (mapping.action === 'reuse') {
            const existing = normalizedCurrentState.assignments[mapping.assignmentId];
            planEntry = {
                sourceKey: group.sourceKey,
                action: 'reuse',
                assignmentId: mapping.assignmentId,
                name: existing.name,
                color: existing.color,
                migratableCount: group.migratableCount,
                unknownColoredCount: group.unknownColoredCount,
            };
        } else if (mapping.action === 'create') {
            const foldedName = mapping.name.toLowerCase();
            const allocated = allocatedCharactersByName.get(foldedName);
            planEntry = {
                sourceKey: group.sourceKey,
                action: 'create',
                assignmentId: allocated.id,
                name: allocated.name,
                color: allocated.color,
                migratableCount: group.migratableCount,
                unknownColoredCount: group.unknownColoredCount,
            };
        }

        sourcePlans.push(planEntry);
        sourcePlanBySourceKey.set(group.sourceKey, planEntry);
    }

    const reusedIds = new Set();
    for (const plan of sourcePlans) {
        if (plan.action === 'reuse') {
            reusedIds.add(plan.assignmentId);
        }
    }

    const reusedAssignments = existingEntries
        .filter(([id]) => reusedIds.has(id))
        .map(([id, assignment]) => ({
            id,
            name: assignment.name,
            color: assignment.color,
        }));

    const plannedState = {
        schemaVersion: normalizedCurrentState.schemaVersion,
        assignments: {},
    };

    for (const [id, assignment] of existingEntries) {
        plannedState.assignments[id] = {
            name: assignment.name,
            color: assignment.color,
        };
    }

    for (const newAssignment of newAssignments) {
        plannedState.assignments[newAssignment.id] = {
            name: newAssignment.name,
            color: newAssignment.color,
        };
    }

    const messageReplacementsMap = new Map();

    for (const occ of inventory.occurrences) {
        if (occ.migratable !== true) {
            continue;
        }

        const plan = sourcePlanBySourceKey.get(occ.sourceKey);
        if (!plan || plan.action === 'skip') {
            continue;
        }

        const tag = occ.tone !== null
            ? `[${plan.assignmentId}:${occ.tone}]`
            : `[${plan.assignmentId}]`;
        const replacementText = `${tag}${occ.content}[/c]`;

        let list = messageReplacementsMap.get(occ.messageIndex);
        if (!list) {
            list = [];
            messageReplacementsMap.set(occ.messageIndex, list);
        }

        list.push({
            sourceKey: occ.sourceKey,
            assignmentId: plan.assignmentId,
            tone: occ.tone,
            raw: occ.raw,
            replacement: replacementText,
            range: {
                start: occ.range.start,
                end: occ.range.end,
            },
        });
    }

    const messageChanges = [];
    const messageIndices = Array.from(messageReplacementsMap.keys()).sort((a, b) => a - b);

    for (const messageIndex of messageIndices) {
        const replacements = messageReplacementsMap.get(messageIndex);
        replacements.sort((a, b) => {
            if (a.range.start !== b.range.start) {
                return a.range.start - b.range.start;
            }
            return a.range.end - b.range.end;
        });

        const before = chat[messageIndex].mes;
        let after = before;
        const spliceOrder = [...replacements].sort((a, b) => b.range.start - a.range.start);

        for (const rep of spliceOrder) {
            after = after.slice(0, rep.range.start) + rep.replacement + after.slice(rep.range.end);
        }

        const role = resolveMessageRole(chat[messageIndex]);

        messageChanges.push({
            messageIndex,
            role,
            before,
            after,
            replacements,
        });
    }

    let skippedMigratableCount = 0;
    for (const plan of sourcePlans) {
        if (plan.action === 'skip') {
            skippedMigratableCount += plan.migratableCount;
        }
    }

    let migratedOccurrenceCount = 0;
    for (const mc of messageChanges) {
        migratedOccurrenceCount += mc.replacements.length;
    }

    const migratableSourceGroups = inventory.groups.filter((g) => g.migratableCount > 0);

    const stats = {
        sourceGroupCount: inventory.groups.length,
        migratableSourceGroupCount: migratableSourceGroups.length,
        mappedSourceGroupCount: sourcePlans.filter(
            (p) => p.action === 'reuse' || p.action === 'create',
        ).length,
        skippedSourceGroupCount: sourcePlans.filter((p) => p.action === 'skip').length,
        newAssignmentCount: newAssignments.length,
        reusedAssignmentCount: reusedAssignments.length,
        changedMessageCount: messageChanges.length,
        migratedOccurrenceCount,
        skippedMigratableCount,
        unknownColoredCount: inventory.stats.unknownColoredCount,
        issueCount: inventory.stats.issueCount,
    };

    return {
        status: 'ready',
        errors: [],
        sourcePlans,
        newAssignments,
        reusedAssignments,
        messageChanges,
        plannedState,
        stats,
    };
}