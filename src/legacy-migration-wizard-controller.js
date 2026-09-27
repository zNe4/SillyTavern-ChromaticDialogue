import { buildLegacyChatInventory } from './legacy-chat-inventory.js';
import { planLegacyMigration } from './legacy-migration-planner.js';
import {
    applyLegacyMigration,
    undoLastLegacyMigration,
} from './legacy-migration-service.js';
import { hasLegacyMigrationUndo } from './legacy-migration-undo-store.js';
import {
    createEmptyState,
    normalizeStateForWrite,
} from './domain.js';
import { CHAT_METADATA_KEY } from './constants.js';

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
 * Deeply clone an arbitrary JSON-compatible value.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneDeep(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(cloneDeep);
    }

    const result = {};
    for (const [key, val] of Object.entries(value)) {
        result[key] = cloneDeep(val);
    }

    return result;
}

/**
 * Read and validate context for wizard operations.
 *
 * @param {(() => unknown) | undefined} getContext
 * @returns {{
 *     status: 'ready' | 'no-chat' | 'invalid-context',
 *     context: Record<string, unknown> | null,
 *     chatId: string | null,
 * }}
 */
function readFreshContext(getContext) {
    let context = null;

    try {
        context = typeof getContext === 'function' ? getContext() : null;
    } catch {
        return { status: 'no-chat', context: null, chatId: null };
    }

    if (!context || typeof context !== 'object') {
        return { status: 'no-chat', context: null, chatId: null };
    }

    const chatId = context.chatId;

    if (
        typeof chatId !== 'string' ||
        chatId.trim().length === 0 ||
        chatId.trim() !== chatId
    ) {
        return { status: 'no-chat', context: null, chatId: null };
    }

    if (
        !Array.isArray(context.chat) ||
        context.chatMetadata === null ||
        typeof context.chatMetadata !== 'object' ||
        Array.isArray(context.chatMetadata)
    ) {
        return { status: 'invalid-context', context: null, chatId: null };
    }

    return { status: 'ready', context, chatId };
}

/**
 * Safely read strict Chromatic Dialogue state from chat metadata.
 *
 * @param {Record<string, unknown>} chatMetadata
 * @returns {{
 *     status: 'ready' | 'invalid-state',
 *     state: object | null,
 * }}
 */
function getStrictState(chatMetadata) {
    if (
        !chatMetadata ||
        !Object.prototype.hasOwnProperty.call(chatMetadata, CHAT_METADATA_KEY)
    ) {
        return { status: 'ready', state: createEmptyState() };
    }

    const normalized = normalizeStateForWrite(chatMetadata[CHAT_METADATA_KEY]);
    if (normalized === null) {
        return { status: 'invalid-state', state: null };
    }

    return { status: 'ready', state: normalized };
}

/**
 * Create a UI-independent wizard controller for legacy chat migration.
 *
 * @param {object} [dependencies={}]
 * @returns {object}
 */
export function createLegacyMigrationWizardController(dependencies = {}) {
    const deps = {
        getContext:
            typeof dependencies?.getContext === 'function'
                ? dependencies.getContext
                : () => globalThis.SillyTavern?.getContext?.(),
        buildInventory:
            typeof dependencies?.buildInventory === 'function'
                ? dependencies.buildInventory
                : buildLegacyChatInventory,
        planMigration:
            typeof dependencies?.planMigration === 'function'
                ? dependencies.planMigration
                : planLegacyMigration,
        applyMigration:
            typeof dependencies?.applyMigration === 'function'
                ? dependencies.applyMigration
                : applyLegacyMigration,
        undoMigration:
            typeof dependencies?.undoMigration === 'function'
                ? dependencies.undoMigration
                : undoLastLegacyMigration,
        hasUndo:
            typeof dependencies?.hasUndo === 'function'
                ? dependencies.hasUndo
                : hasLegacyMigrationUndo,
    };

    let phase = 'idle';
    let chatId = null;
    let includeIntroduction = false;
    let inventory = null;
    const mappingsMap = new Map();
    let storedPreview = null;
    let lastResult = null;
    let undoAvailable = false;

    /**
     * Get stored draft mappings ordered by inventory group sequence.
     *
     * @returns {Array<object>}
     */
    function getOrderedMappings() {
        if (!inventory || !Array.isArray(inventory.groups)) {
            return [];
        }

        const result = [];
        for (const group of inventory.groups) {
            if (mappingsMap.has(group.sourceKey)) {
                result.push(mappingsMap.get(group.sourceKey));
            }
        }

        return result;
    }

    /**
     * Compute current state snapshot.
     *
     * @returns {object}
     */
    function getState() {
        const orderedMappings = getOrderedMappings();
        const requiredMappingCount =
            inventory && Array.isArray(inventory.groups)
                ? inventory.groups.filter((g) => g.migratableCount > 0).length
                : 0;

        const completedMappingCount =
            inventory && Array.isArray(inventory.groups)
                ? inventory.groups.filter(
                      (g) => g.migratableCount > 0 && mappingsMap.has(g.sourceKey),
                  ).length
                : 0;

        const canPreview =
            (phase === 'mapping' || phase === 'preview') &&
            inventory !== null &&
            inventory.status === 'ready' &&
            completedMappingCount === requiredMappingCount;

        const canApply =
            phase === 'preview' &&
            storedPreview !== null &&
            storedPreview.status === 'ready';

        return {
            phase,
            chatId,
            includeIntroduction,
            inventory: cloneDeep(inventory),
            mappings: cloneDeep(orderedMappings),
            preview: cloneDeep(storedPreview),
            lastResult: cloneDeep(lastResult),
            undoAvailable,
            requiredMappingCount,
            completedMappingCount,
            canPreview,
            canApply,
        };
    }

    /**
     * Perform fresh scan of the active chat.
     *
     * @returns {object}
     */
    function scan() {
        let ctxCheck;
        try {
            ctxCheck = readFreshContext(deps.getContext);
        } catch {
            phase = 'error';
            return { status: 'operation-error' };
        }

        if (ctxCheck.status === 'no-chat') {
            return { status: 'no-chat' };
        }
        if (ctxCheck.status === 'invalid-context') {
            return { status: 'invalid-context' };
        }

        const { context, chatId: currentChatId } = ctxCheck;

        const stateResult = getStrictState(context.chatMetadata);
        if (stateResult.status !== 'ready') {
            return { status: 'invalid-state' };
        }
        const strictState = stateResult.state;

        let inv;
        try {
            inv = deps.buildInventory(context.chat, strictState, {
                includeIntroduction,
            });
        } catch {
            phase = 'error';
            return { status: 'operation-error' };
        }

        if (!inv || inv.status !== 'ready') {
            phase = 'error';
            inventory = null;
            mappingsMap.clear();
            storedPreview = null;
            return {
                status: 'inventory-error',
                inventoryStatus: inv?.status,
            };
        }

        phase = 'mapping';
        chatId = currentChatId;
        inventory = cloneDeep(inv);
        mappingsMap.clear();
        storedPreview = null;
        lastResult = null;

        try {
            undoAvailable = Boolean(deps.hasUndo(chatId));
        } catch {
            undoAvailable = false;
        }

        return {
            status: 'ready',
            inventory: cloneDeep(inventory),
        };
    }

    /**
     * Update introduction message inclusion preference.
     *
     * @param {unknown} value
     * @returns {object}
     */
    function setIncludeIntroduction(value) {
        const resolved = value === true;

        if (resolved === includeIntroduction) {
            return {
                status: 'unchanged',
                includeIntroduction,
            };
        }

        includeIntroduction = resolved;
        return scan();
    }

    /**
     * Set or replace a single human mapping draft.
     *
     * @param {string} sourceKey
     * @param {unknown} draft
     * @returns {object}
     */
    function setMapping(sourceKey, draft) {
        if (
            (phase !== 'mapping' && phase !== 'preview') ||
            !inventory ||
            inventory.status !== 'ready'
        ) {
            return { status: 'not-ready' };
        }

        if (typeof sourceKey !== 'string' || sourceKey.length === 0) {
            return { status: 'unknown-source' };
        }

        const group = inventory.groups?.find((g) => g.sourceKey === sourceKey);
        if (!group) {
            return { status: 'unknown-source' };
        }

        if (typeof group.migratableCount !== 'number' || group.migratableCount <= 0) {
            return { status: 'source-not-migratable' };
        }

        if (!isPlainObject(draft)) {
            return { status: 'invalid-draft' };
        }

        if (typeof draft.action !== 'string') {
            return { status: 'invalid-draft' };
        }

        if (draft.action === 'skip') {
            const keys = Object.keys(draft);
            if (keys.length !== 1) {
                return { status: 'invalid-draft' };
            }

            const mapping = { sourceKey, action: 'skip' };
            mappingsMap.set(sourceKey, mapping);
            storedPreview = null;
            phase = 'mapping';
            lastResult = null;

            return { status: 'updated', mapping: cloneDeep(mapping) };
        }

        if (draft.action === 'reuse') {
            const keys = Object.keys(draft);
            if (keys.length !== 2 || !keys.includes('assignmentId')) {
                return { status: 'invalid-draft' };
            }

            if (typeof draft.assignmentId !== 'string') {
                return { status: 'invalid-draft' };
            }

            const mapping = {
                sourceKey,
                action: 'reuse',
                assignmentId: draft.assignmentId,
            };
            mappingsMap.set(sourceKey, mapping);
            storedPreview = null;
            phase = 'mapping';
            lastResult = null;

            return { status: 'updated', mapping: cloneDeep(mapping) };
        }

        if (draft.action === 'create') {
            const keys = Object.keys(draft);
            if (
                keys.length !== 3 ||
                !keys.includes('name') ||
                !keys.includes('color')
            ) {
                return { status: 'invalid-draft' };
            }

            if (typeof draft.name !== 'string' || typeof draft.color !== 'string') {
                return { status: 'invalid-draft' };
            }

            const mapping = {
                sourceKey,
                action: 'create',
                name: draft.name,
                color: draft.color,
            };
            mappingsMap.set(sourceKey, mapping);
            storedPreview = null;
            phase = 'mapping';
            lastResult = null;

            return { status: 'updated', mapping: cloneDeep(mapping) };
        }

        return { status: 'invalid-draft' };
    }

    /**
     * Clear a previously set mapping draft.
     *
     * @param {string} sourceKey
     * @returns {object}
     */
    function clearMapping(sourceKey) {
        if (
            (phase !== 'mapping' && phase !== 'preview') ||
            !inventory ||
            inventory.status !== 'ready'
        ) {
            return { status: 'not-ready' };
        }

        if (typeof sourceKey !== 'string' || !mappingsMap.has(sourceKey)) {
            return { status: 'not-found' };
        }

        mappingsMap.delete(sourceKey);
        storedPreview = null;
        phase = 'mapping';
        lastResult = null;

        return { status: 'cleared', sourceKey };
    }

    /**
     * Run migration preview using deterministic planner.
     *
     * @returns {object}
     */
    function preview() {
        if (!inventory || inventory.status !== 'ready' || !chatId) {
            return { status: 'incomplete-mappings' };
        }

        const migratableGroups =
            inventory.groups?.filter((g) => g.migratableCount > 0) || [];
        for (const group of migratableGroups) {
            if (!mappingsMap.has(group.sourceKey)) {
                return { status: 'incomplete-mappings' };
            }
        }

        let ctxCheck;
        try {
            ctxCheck = readFreshContext(deps.getContext);
        } catch {
            return { status: 'no-chat' };
        }

        if (ctxCheck.status === 'no-chat') {
            return { status: 'no-chat' };
        }

        if (ctxCheck.status === 'invalid-context') {
            return { status: 'invalid-context' };
        }

        if (ctxCheck.chatId !== chatId) {
            return { status: 'chat-changed' };
        }

        const stateResult = getStrictState(ctxCheck.context.chatMetadata);
        if (stateResult.status !== 'ready') {
            return { status: 'invalid-state' };
        }

        const strictCurrentState = stateResult.state;
        const orderedMappings = getOrderedMappings();

        let plannerResult;
        try {
            plannerResult = deps.planMigration(
                ctxCheck.context.chat,
                strictCurrentState,
                cloneDeep(inventory),
                cloneDeep(orderedMappings),
            );
        } catch {
            lastResult = { status: 'operation-error' };
            return { status: 'operation-error' };
        }

        if (plannerResult && plannerResult.status === 'ready') {
            storedPreview = cloneDeep(plannerResult);
            phase = 'preview';
            lastResult = null;
            try {
                undoAvailable = Boolean(deps.hasUndo(chatId));
            } catch {
                undoAvailable = false;
            }

            return {
                status: 'ready',
                preview: cloneDeep(storedPreview),
            };
        }

        storedPreview = null;
        phase = 'mapping';
        lastResult = cloneDeep(plannerResult);

        return {
            status: 'plan-rejected',
            planStatus: plannerResult?.status,
            errors: cloneDeep(plannerResult?.errors || []),
        };
    }

    /**
     * Persist migration preview through transactional service.
     *
     * @returns {Promise<object>}
     */
    async function apply() {
        if (
            phase !== 'preview' ||
            !storedPreview ||
            storedPreview.status !== 'ready'
        ) {
            return { status: 'no-preview' };
        }

        const targetChatId = chatId;
        const detachedInventory = cloneDeep(inventory);
        const detachedMappings = cloneDeep(getOrderedMappings());
        const detachedPreview = cloneDeep(storedPreview);

        let result;
        try {
            result = await deps.applyMigration(
                targetChatId,
                detachedInventory,
                detachedMappings,
                detachedPreview,
            );
        } catch {
            lastResult = { status: 'operation-error' };
            return { status: 'operation-error' };
        }

        const detachedResult = cloneDeep(result);
        lastResult = detachedResult;

        const SUCCESS_STATUSES = new Set([
            'applied',
            'applied-reload-failed',
            'applied-chat-changed',
            'applied-concurrent-change',
            'applied-undo-unavailable',
        ]);

        if (SUCCESS_STATUSES.has(result?.status)) {
            phase = 'applied';
            try {
                undoAvailable = Boolean(deps.hasUndo(targetChatId));
            } catch {
                undoAvailable = false;
            }
            return detachedResult;
        }

        if (result?.status === 'no-op') {
            phase = 'preview';
            return detachedResult;
        }

        const STALE_STATUSES = new Set([
            'plan-rejected',
            'stale-preview',
            'chat-changed',
            'invalid-state',
            'invalid-context',
            'no-chat',
        ]);

        if (STALE_STATUSES.has(result?.status)) {
            phase = 'mapping';
            storedPreview = null;
            return detachedResult;
        }

        phase = 'preview';
        return detachedResult;
    }

    /**
     * Undo last applied migration in the active chat.
     *
     * @returns {Promise<object>}
     */
    async function undo() {
        let ctxCheck;
        try {
            ctxCheck = readFreshContext(deps.getContext);
        } catch {
            return { status: 'no-chat' };
        }

        if (ctxCheck.status === 'no-chat') {
            return { status: 'no-chat' };
        }
        if (ctxCheck.status === 'invalid-context') {
            return { status: 'invalid-context' };
        }

        const currentChatId = ctxCheck.chatId;

        let hasUndoSnapshot = false;
        try {
            hasUndoSnapshot = Boolean(deps.hasUndo(currentChatId));
        } catch {
            hasUndoSnapshot = false;
        }

        if (!hasUndoSnapshot) {
            undoAvailable = false;
            return { status: 'no-undo' };
        }

        let result;
        try {
            result = await deps.undoMigration(currentChatId);
        } catch {
            lastResult = { status: 'operation-error' };
            return { status: 'operation-error' };
        }

        const detachedResult = cloneDeep(result);
        lastResult = detachedResult;

        const UNDO_SUCCESS_STATUSES = new Set([
            'undone',
            'undone-reload-failed',
            'undone-chat-changed',
            'undone-concurrent-change',
        ]);

        if (UNDO_SUCCESS_STATUSES.has(result?.status)) {
            phase = 'undone';
            try {
                undoAvailable = Boolean(deps.hasUndo(currentChatId));
            } catch {
                undoAvailable = false;
            }
            return detachedResult;
        }

        try {
            undoAvailable = Boolean(deps.hasUndo(currentChatId));
        } catch {
            undoAvailable = false;
        }

        return detachedResult;
    }

    /**
     * Reset wizard workflow state.
     *
     * @returns {object}
     */
    function reset() {
        phase = 'idle';
        chatId = null;
        includeIntroduction = false;
        inventory = null;
        mappingsMap.clear();
        storedPreview = null;
        lastResult = null;

        let currentChatId = null;
        try {
            const ctx = deps.getContext?.();
            if (
                ctx &&
                typeof ctx.chatId === 'string' &&
                ctx.chatId.trim().length > 0 &&
                ctx.chatId.trim() === ctx.chatId
            ) {
                currentChatId = ctx.chatId;
            }
        } catch {
            currentChatId = null;
        }

        try {
            undoAvailable =
                currentChatId !== null ? Boolean(deps.hasUndo(currentChatId)) : false;
        } catch {
            undoAvailable = false;
        }

        return getState();
    }

    return {
        scan,
        setIncludeIntroduction,
        setMapping,
        clearMapping,
        preview,
        apply,
        undo,
        reset,
        getState,
    };
}