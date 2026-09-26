import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const settings = readFileSync(
    new URL('../settings.html', import.meta.url),
    'utf8',
);
const styles = readFileSync(
    new URL('../style.css', import.meta.url),
    'utf8',
);

test('1: mode section exists exactly once in settings markup', () => {
    const sectionMatches = [
        ...settings.matchAll(/id="chromatic-dialogue-operation-mode-section"/g),
    ];
    assert.equal(sectionMatches.length, 1);
});

test('2: mode section appears after Chromatic Dialogue description', () => {
    const descIndex = settings.indexOf('class="chromatic-dialogue-description"');
    const modeSectionIndex = settings.indexOf(
        'id="chromatic-dialogue-operation-mode-section"',
    );
    assert.ok(descIndex !== -1, 'main description must exist');
    assert.ok(modeSectionIndex !== -1, 'mode section must exist');
    assert.ok(
        modeSectionIndex > descIndex,
        'mode section must appear after main description',
    );
});

test('3: mode section appears before no-chat state', () => {
    const modeSectionIndex = settings.indexOf(
        'id="chromatic-dialogue-operation-mode-section"',
    );
    const noChatIndex = settings.indexOf('id="chromatic-dialogue-no-chat"');
    assert.ok(noChatIndex !== -1, 'no-chat state must exist');
    assert.ok(
        modeSectionIndex < noChatIndex,
        'mode section must appear before no-chat state',
    );
});

test('4: accessible Operation mode heading exists with exact text', () => {
    assert.match(
        settings,
        /<h3\b[^>]*id="chromatic-dialogue-operation-mode-heading"[^>]*>\s*Operation mode\s*<\/h3>/,
    );
});

test('5: mode section references heading through aria-labelledby', () => {
    assert.match(
        settings,
        /<section\b[^>]*\bid="chromatic-dialogue-operation-mode-section"[^>]*\baria-labelledby="chromatic-dialogue-operation-mode-heading"/,
    );
});

test('6: explicit label targets the select with New character handling text', () => {
    assert.match(
        settings,
        /<label\b[^>]*for="chromatic-dialogue-operation-mode"[^>]*>\s*New character handling\s*<\/label>/,
    );
});

test('7: select exists exactly once', () => {
    const selectMatches = [
        ...settings.matchAll(/id="chromatic-dialogue-operation-mode"/g),
    ];
    assert.equal(selectMatches.length, 1);
});

test('8: select has text_pole class', () => {
    const selectMatch = settings.match(
        /<select\b[^>]*id="chromatic-dialogue-operation-mode"[^>]*>/,
    );
    assert.ok(selectMatch, 'select must exist');
    assert.match(selectMatch[0], /\btext_pole\b/);
    assert.match(selectMatch[0], /\bchromatic-dialogue-mode-select\b/);
});

test('9: select starts disabled', () => {
    const selectMatch = settings.match(
        /<select\b[^>]*id="chromatic-dialogue-operation-mode"[^>]*>/,
    );
    assert.ok(selectMatch, 'select must exist');
    assert.match(selectMatch[0], /\bdisabled\b/);
});

test('10: exactly three options exist in the select', () => {
    const selectBlockMatch = settings.match(
        /<select\b[^>]*id="chromatic-dialogue-operation-mode"[^>]*>([\s\S]*?)<\/select>/,
    );
    assert.ok(selectBlockMatch, 'select block must exist');
    const options = [...selectBlockMatch[1].matchAll(/<option\b/g)];
    assert.equal(options.length, 3);
});

test('11: option values are exactly off, review, and automatic', () => {
    const selectBlockMatch = settings.match(
        /<select\b[^>]*id="chromatic-dialogue-operation-mode"[^>]*>([\s\S]*?)<\/select>/,
    );
    assert.ok(selectBlockMatch);
    const values = [...selectBlockMatch[1].matchAll(/value="([^"]+)"/g)].map(
        (m) => m[1],
    );
    assert.deepEqual(values, ['off', 'review', 'automatic']);
});

test('12: option order is off, review, automatic', () => {
    const selectBlockMatch = settings.match(
        /<select\b[^>]*id="chromatic-dialogue-operation-mode"[^>]*>([\s\S]*?)<\/select>/,
    );
    assert.ok(selectBlockMatch);
    const offIndex = selectBlockMatch[1].indexOf('value="off"');
    const reviewIndex = selectBlockMatch[1].indexOf('value="review"');
    const automaticIndex = selectBlockMatch[1].indexOf('value="automatic"');
    assert.ok(offIndex !== -1);
    assert.ok(reviewIndex > offIndex);
    assert.ok(automaticIndex > reviewIndex);
});

test('13: visible option labels are Off, Review, Automatic', () => {
    const selectBlockMatch = settings.match(
        /<select\b[^>]*id="chromatic-dialogue-operation-mode"[^>]*>([\s\S]*?)<\/select>/,
    );
    assert.ok(selectBlockMatch);
    const labels = [
        ...selectBlockMatch[1].matchAll(
            /<option\b[^>]*>\s*([^<\s]+)\s*<\/option>/g,
        ),
    ].map((m) => m[1]);
    assert.deepEqual(labels, ['Off', 'Review', 'Automatic']);
});

test('14: Review alone is statically selected', () => {
    const selectBlockMatch = settings.match(
        /<select\b[^>]*id="chromatic-dialogue-operation-mode"[^>]*>([\s\S]*?)<\/select>/,
    );
    assert.ok(selectBlockMatch);
    assert.match(
        selectBlockMatch[1],
        /<option\b[^>]*value="review"[^>]*\bselected\b/,
    );
    assert.doesNotMatch(
        selectBlockMatch[1],
        /<option\b[^>]*value="off"[^>]*\bselected\b/,
    );
    assert.doesNotMatch(
        selectBlockMatch[1],
        /<option\b[^>]*value="automatic"[^>]*\bselected\b/,
    );
});

test('15: no blank fourth option exists', () => {
    const selectBlockMatch = settings.match(
        /<select\b[^>]*id="chromatic-dialogue-operation-mode"[^>]*>([\s\S]*?)<\/select>/,
    );
    assert.ok(selectBlockMatch);
    const options = [
        ...selectBlockMatch[1].matchAll(
            /<option\b[^>]*>([\s\S]*?)<\/option>/g,
        ),
    ];
    assert.equal(options.length, 3);
    for (const option of options) {
        assert.ok(option[1].trim().length > 0, 'option text must not be blank');
    }
});

test('16: select references help text through aria-describedby', () => {
    const selectMatch = settings.match(
        /<select\b[^>]*id="chromatic-dialogue-operation-mode"[^>]*>/,
    );
    assert.ok(selectMatch);
    assert.match(
        selectMatch[0],
        /aria-describedby="[^"]*\bchromatic-dialogue-operation-mode-help\b[^"]*"/,
    );
});

test('17: select references feedback element through aria-describedby', () => {
    const selectMatch = settings.match(
        /<select\b[^>]*id="chromatic-dialogue-operation-mode"[^>]*>/,
    );
    assert.ok(selectMatch);
    assert.match(
        selectMatch[0],
        /aria-describedby="[^"]*\bchromatic-dialogue-operation-mode-feedback\b[^"]*"/,
    );
});

test('18: help text explains Off semantics', () => {
    const helpMatch = settings.match(
        /<p\b[^>]*id="chromatic-dialogue-operation-mode-help"[^>]*>([\s\S]*?)<\/p>/,
    );
    assert.ok(helpMatch, 'help element must exist');
    assert.match(
        helpMatch[1],
        /Off\s*—\s*do not process new character proposals/i,
    );
});

test('19: help text explains Review semantics', () => {
    const helpMatch = settings.match(
        /<p\b[^>]*id="chromatic-dialogue-operation-mode-help"[^>]*>([\s\S]*?)<\/p>/,
    );
    assert.ok(helpMatch);
    assert.match(
        helpMatch[1],
        /Review\s*—\s*ask for approval before registering them/i,
    );
});

test('20: help text explains Automatic safe/fallback semantics', () => {
    const helpMatch = settings.match(
        /<p\b[^>]*id="chromatic-dialogue-operation-mode-help"[^>]*>([\s\S]*?)<\/p>/,
    );
    assert.ok(helpMatch);
    assert.match(
        helpMatch[1],
        /Automatic\s*—\s*register safe proposals automatically;\s*anything uncertain remains for manual review/i,
    );
});

test('21: help text states setting is saved per chat', () => {
    const helpMatch = settings.match(
        /<p\b[^>]*id="chromatic-dialogue-operation-mode-help"[^>]*>([\s\S]*?)<\/p>/,
    );
    assert.ok(helpMatch);
    assert.match(helpMatch[1], /This setting is saved per chat/i);
});

test('22: help text does not claim Off disables existing dialogue assignments or colors', () => {
    const helpMatch = settings.match(
        /<p\b[^>]*id="chromatic-dialogue-operation-mode-help"[^>]*>([\s\S]*?)<\/p>/,
    );
    assert.ok(helpMatch);
    assert.doesNotMatch(helpMatch[1], /disables?\s+existing/i);
    assert.match(
        helpMatch[1],
        /Existing assignments continue to function in every mode/i,
    );
});

test('23: feedback element exists with correct id and classes', () => {
    assert.match(
        settings,
        /<p\b[^>]*id="chromatic-dialogue-operation-mode-feedback"[^>]*class="[^"]*chromatic-dialogue-feedback[^"]*chromatic-dialogue-mode-feedback[^"]*"[^>]*>/,
    );
});

test('24: feedback starts hidden', () => {
    const feedbackMatch = settings.match(
        /<p\b[^>]*id="chromatic-dialogue-operation-mode-feedback"[^>]*>/,
    );
    assert.ok(feedbackMatch);
    assert.match(feedbackMatch[0], /\bhidden\b/);
});

test('25: feedback uses role="status"', () => {
    const feedbackMatch = settings.match(
        /<p\b[^>]*id="chromatic-dialogue-operation-mode-feedback"[^>]*>/,
    );
    assert.ok(feedbackMatch);
    assert.match(feedbackMatch[0], /\brole="status"/);
});

test('26: feedback uses aria-live="polite"', () => {
    const feedbackMatch = settings.match(
        /<p\b[^>]*id="chromatic-dialogue-operation-mode-feedback"[^>]*>/,
    );
    assert.ok(feedbackMatch);
    assert.match(feedbackMatch[0], /\baria-live="polite"/);
});

test('27: feedback starts with no initial text content', () => {
    const feedbackBlock = settings.match(
        /<p\b[^>]*id="chromatic-dialogue-operation-mode-feedback"[^>]*>([\s\S]*?)<\/p>/,
    );
    assert.ok(feedbackBlock);
    assert.equal(feedbackBlock[1].trim(), '');
});

test('28: mode section CSS exists and defines scoped rules', () => {
    assert.match(styles, /\.chromatic-dialogue-mode-section\s*\{/);
    assert.match(styles, /\.chromatic-dialogue-mode-title\s*\{/);
    assert.match(styles, /\.chromatic-dialogue-mode-control\s*\{/);
    assert.match(styles, /\.chromatic-dialogue-mode-label\s*\{/);
    assert.match(styles, /\.chromatic-dialogue-mode-help\s*\{/);
    assert.match(styles, /\.chromatic-dialogue-mode-feedback\s*\{/);
});

test('29: mode select CSS exists and is scoped', () => {
    assert.match(styles, /\.chromatic-dialogue-mode-select\s*\{/);
});

test('30: select width is 100%', () => {
    const selectCssMatch = styles.match(
        /\.chromatic-dialogue-mode-select\s*\{([^}]+)\}/,
    );
    assert.ok(selectCssMatch);
    assert.match(selectCssMatch[1], /width:\s*100%;/);
});

test('31: select min-width is 0', () => {
    const selectCssMatch = styles.match(
        /\.chromatic-dialogue-mode-select\s*\{([^}]+)\}/,
    );
    assert.ok(selectCssMatch);
    assert.match(selectCssMatch[1], /min-width:\s*0;/);
});

test('32: select uses box-sizing: border-box', () => {
    const selectCssMatch = styles.match(
        /\.chromatic-dialogue-mode-select\s*\{([^}]+)\}/,
    );
    assert.ok(selectCssMatch);
    assert.match(selectCssMatch[1], /box-sizing:\s*border-box;/);
});

test('33: no fixed pixel select width', () => {
    const selectCssMatch = styles.match(
        /\.chromatic-dialogue-mode-select\s*\{([^}]+)\}/,
    );
    assert.ok(selectCssMatch);
    assert.doesNotMatch(selectCssMatch[1], /\bwidth:\s*\d+px\b/);
});

test('34: mode CSS uses SmartTheme-compatible variables', () => {
    const sectionCssMatch = styles.match(
        /\.chromatic-dialogue-mode-section\s*\{([^}]+)\}/,
    );
    assert.ok(sectionCssMatch);
    assert.match(sectionCssMatch[1], /var\(--SmartThemeBorderColor\)/);
    assert.match(sectionCssMatch[1], /var\(--SmartThemeBlurTintColor\)/);
});

test('35: mode section prevents horizontal overflow safely', () => {
    const sectionCssMatch = styles.match(
        /\.chromatic-dialogue-mode-section\s*\{([^}]+)\}/,
    );
    assert.ok(sectionCssMatch);
    assert.match(sectionCssMatch[1], /box-sizing:\s*border-box;/);
    assert.match(sectionCssMatch[1], /width:\s*100%;/);
    assert.match(sectionCssMatch[1], /min-width:\s*0;/);
    assert.match(sectionCssMatch[1], /overflow-wrap:\s*anywhere;/);
});

test('36: existing Review markup remains present and intact', () => {
    assert.match(settings, /id="chromatic-dialogue-review-section"/);
    assert.match(settings, /id="chromatic-dialogue-review-count"/);
    assert.match(settings, /id="chromatic-dialogue-review-list"/);
    assert.match(settings, /id="chromatic-dialogue-review-feedback"/);
});

test('37: existing Review responsive CSS remains present and intact', () => {
    assert.match(
        styles,
        /@container\s*\(max-width:\s*420px\)[\s\S]*?\.chromatic-dialogue-review-actions/,
    );
    assert.match(
        styles,
        /@container\s*\(max-width:\s*420px\)[\s\S]*?\.chromatic-dialogue-review-proposal/,
    );
});

test('38: existing assignment markup remains present and intact', () => {
    assert.match(settings, /id="chromatic-dialogue-no-chat"/);
    assert.match(settings, /id="chromatic-dialogue-empty-state"/);
    assert.match(settings, /id="chromatic-dialogue-assignment-list"/);
    assert.match(settings, /id="chromatic-dialogue-assignment-form"/);
    assert.match(settings, /id="chromatic-dialogue-assignment-fields"/);
    assert.match(settings, /id="chromatic-dialogue-assignment-add"/);
    assert.match(settings, /id="chromatic-dialogue-assignment-cancel-edit"/);
});

test('39: existing assignment CSS remains present and intact', () => {
    assert.match(styles, /\.chromatic-dialogue-assignment\s*\{/);
    assert.match(styles, /\.chromatic-dialogue-assignment-list\s*\{/);
    assert.match(styles, /\.chromatic-dialogue-assignment-actions\s*\{/);
    assert.match(styles, /\.chromatic-dialogue-form-grid\s*\{/);
});

test('40: no script tag or inline event handlers are introduced', () => {
    assert.doesNotMatch(settings, /<script\b/i);
    assert.doesNotMatch(settings, /\bon[a-z]+=/i);
});