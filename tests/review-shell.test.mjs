import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as constants from '../src/constants.js';

const settings = readFileSync(
    new URL('../settings.html', import.meta.url),
    'utf8',
);
const styles = readFileSync(
    new URL('../style.css', import.meta.url),
    'utf8',
);

test('constants: exports all four review constants with exact values', () => {
    assert.equal(
        constants.REVIEW_SECTION_ID,
        'chromatic-dialogue-review-section',
    );
    assert.equal(
        constants.REVIEW_COUNT_ID,
        'chromatic-dialogue-review-count',
    );
    assert.equal(
        constants.REVIEW_LIST_ID,
        'chromatic-dialogue-review-list',
    );
    assert.equal(
        constants.REVIEW_FEEDBACK_ID,
        'chromatic-dialogue-review-feedback',
    );
});

test('constants: preserves all baseline constants without renaming', () => {
    assert.equal(constants.CHAT_METADATA_KEY, 'chromatic_dialogue');
    assert.equal(constants.SCHEMA_VERSION, 1);
    assert.equal(constants.CHAT_CONTENT_SELECTOR, '#chat .mes_text');
    assert.equal(constants.DIALOGUE_CLASS_PREFIX, 'custom-cd-');
    assert.equal(
        constants.GENERATED_STYLE_ID,
        'chromatic-dialogue-generated-styles',
    );
    assert.equal(
        constants.EXTENSION_FOLDER,
        'third-party/SillyTavern-ChromaticDialogue',
    );
    assert.equal(
        constants.EXTENSIONS_SETTINGS_CONTAINER_ID,
        'extensions_settings2',
    );
    assert.equal(constants.PANEL_ID, 'chromatic-dialogue-settings');
    assert.equal(
        constants.PANEL_DRAWER_TOGGLE_ID,
        'chromatic-dialogue-drawer-toggle',
    );
    assert.equal(
        constants.NO_CHAT_STATE_ID,
        'chromatic-dialogue-no-chat',
    );
    assert.equal(
        constants.EMPTY_CHAT_STATE_ID,
        'chromatic-dialogue-empty-state',
    );
    assert.equal(
        constants.ASSIGNMENT_LIST_ID,
        'chromatic-dialogue-assignment-list',
    );
    assert.equal(
        constants.ASSIGNMENT_FORM_FIELDSET_ID,
        'chromatic-dialogue-assignment-fields',
    );
    assert.equal(
        constants.ASSIGNMENT_FORM_LEGEND_ID,
        'chromatic-dialogue-assignment-legend',
    );
    assert.equal(
        constants.ASSIGNMENT_COLOR_PICKER_ID,
        'chromatic-dialogue-assignment-color-picker',
    );
    assert.equal(
        constants.ASSIGNMENT_HEX_COLOR_INPUT_ID,
        'chromatic-dialogue-assignment-color',
    );
    assert.equal(
        constants.ASSIGNMENT_COLOR_PREVIEW_ID,
        'chromatic-dialogue-assignment-color-preview',
    );
    assert.equal(
        constants.ASSIGNMENT_ID_INPUT_ID,
        'chromatic-dialogue-assignment-id',
    );
    assert.equal(
        constants.ASSIGNMENT_NAME_INPUT_ID,
        'chromatic-dialogue-assignment-name',
    );
    assert.equal(
        constants.ASSIGNMENT_ADD_BUTTON_ID,
        'chromatic-dialogue-assignment-add',
    );
    assert.equal(
        constants.ASSIGNMENT_CANCEL_EDIT_BUTTON_ID,
        'chromatic-dialogue-assignment-cancel-edit',
    );
    assert.equal(
        constants.ASSIGNMENT_FEEDBACK_ID,
        'chromatic-dialogue-assignment-feedback',
    );
});

test('constants: introduces no persistence or runtime concepts', () => {
    const exportedKeys = Object.keys(constants);
    for (const key of exportedKeys) {
        assert.equal(typeof constants[key], key === 'SCHEMA_VERSION' ? 'number' : 'string');
    }
    const constantsSource = readFileSync(
        new URL('../src/constants.js', import.meta.url),
        'utf8',
    );
    assert.doesNotMatch(constantsSource, /\b(?:fetch|localStorage|sessionStorage|import\s+.*from)\b/);
});

test('markup: review section exists, starts hidden, and maintains ordering', () => {
    assert.match(
        settings,
        /<section\b[\s\S]*?id="chromatic-dialogue-review-section"[\s\S]*?\bhidden\b/,
    );

    const noChatIndex = settings.indexOf('id="chromatic-dialogue-no-chat"');
    const reviewSectionIndex = settings.indexOf(
        'id="chromatic-dialogue-review-section"',
    );
    const emptyStateIndex = settings.indexOf(
        'id="chromatic-dialogue-empty-state"',
    );

    assert.ok(noChatIndex !== -1, 'no-chat state must exist');
    assert.ok(reviewSectionIndex !== -1, 'review section must exist');
    assert.ok(emptyStateIndex !== -1, 'empty-assignment state must exist');
    assert.ok(
        reviewSectionIndex > noChatIndex,
        'review section must appear after no-chat state',
    );
    assert.ok(
        reviewSectionIndex < emptyStateIndex,
        'review section must appear before empty-assignment state',
    );
});

test('markup: review heading and count have accessible labels and relationships', () => {
    assert.match(
        settings,
        /<section\b[^>]*\bid="chromatic-dialogue-review-section"[^>]*\baria-labelledby="chromatic-dialogue-review-heading"/,
    );
    assert.match(
        settings,
        /<h3\b[^>]*\bid="chromatic-dialogue-review-heading"[^>]*>\s*Pending review\s*<\/h3>/,
    );
    assert.match(
        settings,
        /<span\b[^>]*\bid="chromatic-dialogue-review-count"[^>]*\baria-label="Pending review count"[^>]*>\s*0\s*<\/span>/,
    );
});

test('markup: review description exists with appropriate non-committal copy', () => {
    assert.match(
        settings,
        /<p\b[^>]*class="[^"]*chromatic-dialogue-review-description[^"]*"[^>]*>\s*AI-proposed new speakers waiting for your approval\. Pending reviews are session-only until accepted\.\s*<\/p>/,
    );
});

test('markup: review list exists with list role, label, and starts empty', () => {
    const listMatch = settings.match(
        /<div\b[^>]*\bid="chromatic-dialogue-review-list"[^>]*>([\s\S]*?)<\/div>/,
    );
    assert.ok(listMatch, 'review list element must exist');
    assert.match(listMatch[0], /\brole="list"/);
    assert.match(listMatch[0], /\baria-label="Pending character proposals"/);
    assert.equal(listMatch[1].trim(), '', 'review list must start empty without static cards');
});

test('markup: review feedback exists, starts hidden, and has polite status role', () => {
    const feedbackMatch = settings.match(
        /<p\b[^>]*\bid="chromatic-dialogue-review-feedback"[^>]*>/,
    );
    assert.ok(feedbackMatch, 'review feedback element must exist');
    assert.match(feedbackMatch[0], /\brole="status"/);
    assert.match(feedbackMatch[0], /\baria-live="polite"/);
    assert.match(feedbackMatch[0], /\bhidden\b/);
    assert.match(feedbackMatch[0], /class="[^"]*chromatic-dialogue-review-feedback[^"]*"/);
});

test('markup: contains no static review cards, action buttons, or sample proposals', () => {
    assert.doesNotMatch(settings, /class="[^"]*chromatic-dialogue-review-card[^"]*"/);
    assert.doesNotMatch(settings, /\bMara\b/i);
    assert.doesNotMatch(settings, /\bAlice\b/i);

    const reviewSectionMatch = settings.match(
        /<section\b[^>]*id="chromatic-dialogue-review-section"[\s\S]*?<\/section>/,
    );
    assert.ok(reviewSectionMatch);
    const reviewSectionHtml = reviewSectionMatch[0];

    assert.doesNotMatch(reviewSectionHtml, />\s*Approve\s*</i);
    assert.doesNotMatch(reviewSectionHtml, />\s*Dismiss\s*</i);
    assert.doesNotMatch(reviewSectionHtml, /<button/i);
});

test('markup: preserves existing baseline states and controls', () => {
    assert.match(settings, /id="chromatic-dialogue-no-chat"/);
    assert.match(settings, /id="chromatic-dialogue-empty-state"/);
    assert.match(settings, /id="chromatic-dialogue-assignment-list"/);
    assert.match(settings, /id="chromatic-dialogue-assignment-form"/);
    assert.match(settings, /id="chromatic-dialogue-assignment-fields"/);
    assert.match(settings, /id="chromatic-dialogue-assignment-add"/);
    assert.match(settings, /id="chromatic-dialogue-assignment-cancel-edit"/);

    const ids = [...settings.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, new Set(ids).size, 'all IDs must be globally unique');
});

test('markup: purely presentational without embedded scripts or inline handlers', () => {
    assert.doesNotMatch(settings, /<script\b/i);
    assert.doesNotMatch(settings, /\bon[a-z]+=/i);
});

test('css: defines review shell, card, proposal, swatch, and action contracts', () => {
    const requiredClasses = [
        'chromatic-dialogue-review-section',
        'chromatic-dialogue-review-header',
        'chromatic-dialogue-review-title',
        'chromatic-dialogue-review-count',
        'chromatic-dialogue-review-description',
        'chromatic-dialogue-review-list',
        'chromatic-dialogue-review-card',
        'chromatic-dialogue-review-card-header',
        'chromatic-dialogue-review-message-id',
        'chromatic-dialogue-review-proposals',
        'chromatic-dialogue-review-proposal',
        'chromatic-dialogue-review-proposal-id',
        'chromatic-dialogue-review-proposal-name',
        'chromatic-dialogue-review-color-row',
        'chromatic-dialogue-review-color-swatch',
        'chromatic-dialogue-review-color-value',
        'chromatic-dialogue-review-adjusted',
        'chromatic-dialogue-review-contrast',
        'chromatic-dialogue-review-actions',
        'chromatic-dialogue-review-feedback',
    ];

    for (const className of requiredClasses) {
        const regex = new RegExp(`\\.${className}\\b`);
        assert.match(styles, regex, `CSS must define class .${className}`);
    }
});

test('css: color swatch is flexible and does not hard-code proposal colors', () => {
    const swatchMatch = styles.match(
        /\.chromatic-dialogue-review-color-swatch\s*\{([^}]+)\}/,
    );
    assert.ok(swatchMatch, 'swatch rules must exist');
    const swatchCss = swatchMatch[1];

    assert.match(swatchCss, /border:/);
    assert.doesNotMatch(
        swatchCss,
        /background(?:-color)?\s*:\s*#(?:[0-9a-fA-F]{3,8})\b/,
        'swatch must not have a hard-coded hex background color',
    );
});

test('css: review cards and proposal text support wrapping without vertical letter stacking', () => {
    assert.match(
        styles,
        /\.chromatic-dialogue-review-card\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;/,
    );
    assert.match(
        styles,
        /\.chromatic-dialogue-review-proposal\s*\{[\s\S]*?min-width:\s*0;/,
    );
    assert.match(
        styles,
        /\.chromatic-dialogue-review-proposal-name\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*break-word;[\s\S]*?word-break:\s*normal;/,
    );
});

test('css: review proposals reserve a full-width details row for color metadata', () => {
    const proposalMatch = styles.match(
        /\.chromatic-dialogue-review-proposal\s*\{([^}]+)\}/,
    );
    assert.ok(proposalMatch, 'review proposal rules must exist');
    const proposalCss = proposalMatch[1];
    assert.match(proposalCss, /grid-template-columns:\s*minmax\(2\.5rem,\s*auto\)\s+minmax\(0,\s*1fr\);/);
    assert.match(proposalCss, /grid-template-areas:[\s\S]*?"id name"[\s\S]*?"color color";/);

    const colorRowMatch = styles.match(
        /\.chromatic-dialogue-review-color-row\s*\{([^}]+)\}/,
    );
    assert.ok(colorRowMatch, 'review color row rules must exist');
    const colorRowCss = colorRowMatch[1];
    assert.match(colorRowCss, /grid-area:\s*color;/);
    assert.match(colorRowCss, /display:\s*grid;/);
    assert.match(colorRowCss, /grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\);/);

    assert.match(styles, /\.chromatic-dialogue-review-adjusted\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/);
    assert.match(styles, /\.chromatic-dialogue-review-contrast\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/);
});

test('css: committed assignment rows use two stable rows before the narrow breakpoint', () => {
    const assignmentMatch = styles.match(
        /\.chromatic-dialogue-assignment\s*\{([^}]+)\}/,
    );
    assert.ok(assignmentMatch, 'assignment rules must exist');
    const assignmentCss = assignmentMatch[1];
    assert.match(assignmentCss, /grid-template-columns:\s*minmax\(3rem,\s*auto\)\s+minmax\(0,\s*1fr\);/);
    assert.match(assignmentCss, /grid-template-areas:[\s\S]*?"id name"[\s\S]*?"color actions";/);
    assert.doesNotMatch(assignmentCss, /auto\s+auto\s*;/);

    assert.match(
        styles,
        /\.chromatic-dialogue-assignment-name\s*\{[\s\S]*?overflow-wrap:\s*break-word;[\s\S]*?word-break:\s*normal;/,
    );
});

test('css: responsive container query covers review actions and proposal layout', () => {
    assert.match(
        styles,
        /@container\s*\(max-width:\s*420px\)[\s\S]*?\.chromatic-dialogue-review-actions\s*\{/,
    );
    assert.match(
        styles,
        /@container\s*\(max-width:\s*420px\)[\s\S]*?\.chromatic-dialogue-review-actions\s+\.menu_button\s*\{[\s\S]*?width:\s*100%;/,
    );
    assert.match(
        styles,
        /@container\s*\(max-width:\s*420px\)[\s\S]*?\.chromatic-dialogue-review-proposal\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?grid-template-areas:[\s\S]*?"id"[\s\S]*?"name"[\s\S]*?"color";/,
    );
});

test('css: review action hardening uses two-column flexible grid and prevents label wrapping', () => {
    const normalActionsMatch = styles.match(
        /\.chromatic-dialogue-review-actions\s*\{([^}]+)\}/,
    );
    assert.ok(normalActionsMatch, 'review-actions rule must exist');
    const actionsCss = normalActionsMatch[1];
    assert.match(actionsCss, /display:\s*grid;/);
    assert.match(
        actionsCss,
        /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
    );
    assert.match(actionsCss, /min-width:\s*0;/);
    assert.doesNotMatch(actionsCss, /grid-template-columns:[^;]*\b\d+px\b/);

    const buttonRuleMatch = styles.match(
        /\.chromatic-dialogue-review-actions\s+\.menu_button\s*\{([^}]+)\}/,
    );
    assert.ok(buttonRuleMatch, 'review-actions .menu_button rule must exist');
    const buttonCss = buttonRuleMatch[1];
    assert.match(buttonCss, /box-sizing:\s*border-box;/);
    assert.match(buttonCss, /width:\s*100%;/);
    assert.match(buttonCss, /min-width:\s*0;/);
    assert.match(buttonCss, /max-width:\s*none;/);
    assert.match(buttonCss, /white-space:\s*nowrap;/);
    assert.doesNotMatch(buttonCss, /\bwidth:\s*\d+px\b/);

    assert.match(
        styles,
        /@container\s*\(max-width:\s*420px\)[\s\S]*?\.chromatic-dialogue-review-actions\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    );
    assert.match(
        styles,
        /@container\s*\(max-width:\s*420px\)[\s\S]*?\.chromatic-dialogue-review-actions\s+\.menu_button\s*\{[\s\S]*?width:\s*100%;/,
    );

    assert.match(
        styles,
        /\.chromatic-dialogue-assignment-actions\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;/,
    );
    assert.match(
        styles,
        /\.chromatic-dialogue-form-actions\s*\{[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*flex-end;/,
    );

    assert.match(styles, /\.chromatic-dialogue-review-card\b/);
    assert.match(styles, /\.chromatic-dialogue-review-proposal\b/);
    assert.match(styles, /\.chromatic-dialogue-review-color-swatch\b/);

    assert.doesNotMatch(settings, /<button[^>]*class="[^"]*chromatic-dialogue-review/i);
    assert.doesNotMatch(settings, /<script\b/i);
});