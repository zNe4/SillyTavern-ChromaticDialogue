import {
    MANAGED_FIELDS,
    MANAGED_REGEX_SCRIPTS,
} from './regex-definitions.js';

export const REGEX_INTEGRATION_STATUS = Object.freeze({
    CURRENT: 'current',
    NEEDS_REPAIR: 'needs-repair',
    CONFLICT: 'conflict',
    REGEX_DISABLED: 'regex-disabled',
    UNAVAILABLE: 'unavailable',
});

export const REGEX_SCRIPT_STATUS = Object.freeze({
    CURRENT: 'current',
    MISSING: 'missing',
    OUTDATED: 'outdated',
    CONFLICT: 'conflict',
});

/**
 * Determine whether an installed script ID is a non-empty string.
 *
 * @param {unknown} id
 * @returns {boolean}
 */
function isValidInstalledId(id) {
    return typeof id === 'string' && id.trim().length > 0;
}

/**
 * Compare two managed field values for strict equivalence.
 *
 * @param {unknown} canonicalVal
 * @param {unknown} installedVal
 * @returns {boolean}
 */
function areFieldValuesEqual(canonicalVal, installedVal) {
    if (Array.isArray(canonicalVal) || Array.isArray(installedVal)) {
        if (!Array.isArray(canonicalVal) || !Array.isArray(installedVal)) {
            return false;
        }
        if (canonicalVal.length !== installedVal.length) {
            return false;
        }
        for (let i = 0; i < canonicalVal.length; i++) {
            if (canonicalVal[i] !== installedVal[i]) {
                return false;
            }
        }
        return true;
    }
    return canonicalVal === installedVal;
}

/**
 * Determine whether a chat ID identifies an active chat.
 *
 * @param {unknown} chatId
 * @returns {boolean}
 */
function hasActiveChatId(chatId) {
    if (chatId === null || chatId === undefined || Number.isNaN(chatId)) {
        return false;
    }
    if (typeof chatId === 'string') {
        return chatId.trim().length > 0;
    }
    return true;
}

/**
 * Create a new SillyTavern global Regex script object from a canonical definition.
 *
 * @param {typeof MANAGED_REGEX_SCRIPTS[number]} canonical
 * @param {string} id
 * @returns {Record<string, unknown>}
 */
function createScriptPayload(canonical, id) {
    const script = { id };
    for (const field of MANAGED_FIELDS) {
        if (Array.isArray(canonical[field])) {
            script[field] = [...canonical[field]];
        } else {
            script[field] = canonical[field];
        }
    }
    return script;
}

/**
 * Repair an existing installed script object in-place, preserving unmanaged fields and ID.
 *
 * @param {Record<string, unknown>} existing
 * @param {typeof MANAGED_REGEX_SCRIPTS[number]} canonical
 * @param {{ uuidv4: () => string }} context
 * @returns {Record<string, unknown>}
 */
function repairExistingScript(existing, canonical, context) {
    const repaired = { ...existing };
    for (const field of MANAGED_FIELDS) {
        if (Array.isArray(canonical[field])) {
            repaired[field] = [...canonical[field]];
        } else {
            repaired[field] = canonical[field];
        }
    }
    if (!isValidInstalledId(repaired.id)) {
        repaired.id = context.uuidv4();
    }
    delete repaired.key;
    return repaired;
}

/**
 * Pure inspection of extension settings for Chromatic Dialogue Regex integration.
 *
 * @param {unknown} extensionSettings
 * @returns {{
 *     status: 'current' | 'needs-repair' | 'conflict' | 'regex-disabled' | 'unavailable',
 *     regexExtensionDisabled: boolean,
 *     scripts: Array<{
 *         key: string,
 *         scriptName: string,
 *         status: 'current' | 'missing' | 'outdated' | 'conflict',
 *         matchCount: number,
 *         differingFields: string[],
 *     }>
 * }}
 */
export function inspectRegexIntegrationState(extensionSettings) {
    if (
        !extensionSettings ||
        typeof extensionSettings !== 'object' ||
        Array.isArray(extensionSettings)
    ) {
        return {
            status: REGEX_INTEGRATION_STATUS.UNAVAILABLE,
            regexExtensionDisabled: false,
            scripts: [],
        };
    }

    const regexExtensionDisabled =
        Array.isArray(extensionSettings.disabledExtensions) &&
        extensionSettings.disabledExtensions.includes('regex');

    if (
        extensionSettings.regex !== undefined &&
        extensionSettings.regex !== null &&
        !Array.isArray(extensionSettings.regex)
    ) {
        return {
            status: REGEX_INTEGRATION_STATUS.UNAVAILABLE,
            regexExtensionDisabled,
            scripts: [],
        };
    }

    const regexList = extensionSettings.regex ?? [];

    const scripts = MANAGED_REGEX_SCRIPTS.map((canonical) => {
        const matches = regexList.filter(
            (script) =>
                script &&
                typeof script === 'object' &&
                !Array.isArray(script) &&
                script.scriptName === canonical.scriptName,
        );

        if (matches.length === 0) {
            return {
                key: canonical.key,
                scriptName: canonical.scriptName,
                status: REGEX_SCRIPT_STATUS.MISSING,
                matchCount: 0,
                differingFields: [],
            };
        }

        if (matches.length > 1) {
            return {
                key: canonical.key,
                scriptName: canonical.scriptName,
                status: REGEX_SCRIPT_STATUS.CONFLICT,
                matchCount: matches.length,
                differingFields: [],
            };
        }

        const installed = matches[0];
        const differingFields = [];

        for (const field of MANAGED_FIELDS) {
            if (!areFieldValuesEqual(canonical[field], installed[field])) {
                differingFields.push(field);
            }
        }

        if (!isValidInstalledId(installed.id)) {
            differingFields.push('id');
        }

        return {
            key: canonical.key,
            scriptName: canonical.scriptName,
            status:
                differingFields.length === 0
                    ? REGEX_SCRIPT_STATUS.CURRENT
                    : REGEX_SCRIPT_STATUS.OUTDATED,
            matchCount: 1,
            differingFields,
        };
    });

    let status = REGEX_INTEGRATION_STATUS.CURRENT;

    if (regexExtensionDisabled) {
        status = REGEX_INTEGRATION_STATUS.REGEX_DISABLED;
    } else if (scripts.some((s) => s.status === REGEX_SCRIPT_STATUS.CONFLICT)) {
        status = REGEX_INTEGRATION_STATUS.CONFLICT;
    } else if (
        scripts.some(
            (s) =>
                s.status === REGEX_SCRIPT_STATUS.MISSING ||
                s.status === REGEX_SCRIPT_STATUS.OUTDATED,
        )
    ) {
        status = REGEX_INTEGRATION_STATUS.NEEDS_REPAIR;
    }

    return {
        status,
        regexExtensionDisabled,
        scripts,
    };
}

/**
 * Read the current Regex integration status from the active SillyTavern context.
 *
 * @returns {ReturnType<typeof inspectRegexIntegrationState>}
 */
export function readRegexIntegrationStatus() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context) {
        return {
            status: REGEX_INTEGRATION_STATUS.UNAVAILABLE,
            regexExtensionDisabled: false,
            scripts: [],
        };
    }
    return inspectRegexIntegrationState(context.extensionSettings);
}

/**
 * Explicit user-requested repair/installation of managed global Regex scripts.
 *
 * @returns {Promise<{
 *     status: 'unavailable' | 'regex-disabled' | 'conflict' | 'already-current' | 'save-error' | 'updated-reload-failed' | 'updated',
 *     inspection: ReturnType<typeof inspectRegexIntegrationState>,
 * }>}
 */
export async function repairRegexIntegration() {
    const context = globalThis.SillyTavern?.getContext?.();

    if (!context) {
        return {
            status: 'unavailable',
            inspection: {
                status: REGEX_INTEGRATION_STATUS.UNAVAILABLE,
                regexExtensionDisabled: false,
                scripts: [],
            },
        };
    }

    const inspection = inspectRegexIntegrationState(context.extensionSettings);

    if (inspection.status === REGEX_INTEGRATION_STATUS.UNAVAILABLE) {
        return {
            status: 'unavailable',
            inspection,
        };
    }

    if (inspection.status === REGEX_INTEGRATION_STATUS.REGEX_DISABLED) {
        return {
            status: 'regex-disabled',
            inspection,
        };
    }

    if (inspection.status === REGEX_INTEGRATION_STATUS.CONFLICT) {
        return {
            status: 'conflict',
            inspection,
        };
    }

    if (inspection.status === REGEX_INTEGRATION_STATUS.CURRENT) {
        return {
            status: 'already-current',
            inspection,
        };
    }

    if (
        typeof context.uuidv4 !== 'function' ||
        typeof context.saveSettingsDebounced !== 'function'
    ) {
        return {
            status: 'unavailable',
            inspection,
        };
    }

    const originalList = context.extensionSettings.regex ?? [];
    const repairedList = [];
    const processedCanonicalKeys = new Set();

    for (const script of originalList) {
        if (!script || typeof script !== 'object' || Array.isArray(script)) {
            repairedList.push(script);
            continue;
        }

        const canonical = MANAGED_REGEX_SCRIPTS.find(
            (def) => def.scriptName === script.scriptName,
        );

        if (canonical) {
            processedCanonicalKeys.add(canonical.key);
            repairedList.push(repairExistingScript(script, canonical, context));
        } else {
            repairedList.push(script);
        }
    }

    for (const canonical of MANAGED_REGEX_SCRIPTS) {
        if (!processedCanonicalKeys.has(canonical.key)) {
            repairedList.push(createScriptPayload(canonical, context.uuidv4()));
        }
    }

    const originalRegexRef = context.extensionSettings.regex;
    context.extensionSettings.regex = repairedList;

    try {
        context.saveSettingsDebounced();
    } catch {
        context.extensionSettings.regex = originalRegexRef;
        return {
            status: 'save-error',
            inspection,
        };
    }

    if (
        hasActiveChatId(context.chatId) &&
        typeof context.reloadCurrentChat === 'function'
    ) {
        try {
            await context.reloadCurrentChat();
        } catch {
            return {
                status: 'updated-reload-failed',
                inspection: inspectRegexIntegrationState(
                    context.extensionSettings,
                ),
            };
        }
    }

    return {
        status: 'updated',
        inspection: inspectRegexIntegrationState(context.extensionSettings),
    };
}