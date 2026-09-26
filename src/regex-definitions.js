export const MANAGED_FIELDS = Object.freeze([
    'scriptName',
    'findRegex',
    'replaceString',
    'trimStrings',
    'placement',
    'disabled',
    'markdownOnly',
    'promptOnly',
    'runOnEdit',
    'substituteRegex',
    'minDepth',
    'maxDepth',
]);

const DIALOGUE_DISPLAY_SCRIPT = Object.freeze({
    key: 'dialogue-display',
    scriptName: 'Chromatic Dialogue - Dialogue display',
    findRegex: '/\\[c([1-9]\\d?)(?::(whisper|shout|measured|tremble))?\\]([\\s\\S]*?)\\[\\/c\\]/g',
    replaceString: '<span class="cd-c$1 cd-tone-$2">“$3”</span>',
    trimStrings: Object.freeze([]),
    placement: Object.freeze([2]),
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: true,
    substituteRegex: 0,
    minDepth: 0,
    maxDepth: 50,
});

const PROMPT_HYGIENE_SCRIPT = Object.freeze({
    key: 'prompt-hygiene',
    scriptName: 'Chromatic Dialogue - Hide control records from prompt',
    findRegex: '/^[ \\t]*<!--[ \\t]*CD_NEW\\b[^\\r\\n]*-->[ \\t]*(?:\\r?\\n)?/gm',
    replaceString: '',
    trimStrings: Object.freeze([]),
    placement: Object.freeze([2]),
    disabled: false,
    markdownOnly: false,
    promptOnly: true,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
});

export const MANAGED_REGEX_SCRIPTS = Object.freeze([
    DIALOGUE_DISPLAY_SCRIPT,
    PROMPT_HYGIENE_SCRIPT,
]);