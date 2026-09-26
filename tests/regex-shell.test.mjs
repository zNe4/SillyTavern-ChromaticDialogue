import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('1: Regex section exists exactly once', () => {
    const matches = html.match(/id="chromatic-dialogue-regex-section"/g);
    assert.equal(matches?.length, 1);
});

test('2: Regex section appears after Operation mode section', () => {
    const opModeIdx = html.indexOf('id="chromatic-dialogue-operation-mode-section"');
    const regexIdx = html.indexOf('id="chromatic-dialogue-regex-section"');
    assert.ok(opModeIdx >= 0);
    assert.ok(regexIdx >= 0);
    assert.ok(regexIdx > opModeIdx);
});

test('3: Regex section appears before no-chat state', () => {
    const regexIdx = html.indexOf('id="chromatic-dialogue-regex-section"');
    const noChatIdx = html.indexOf('id="chromatic-dialogue-no-chat"');
    assert.ok(regexIdx >= 0);
    assert.ok(noChatIdx >= 0);
    assert.ok(regexIdx < noChatIdx);
});

test('4: accessible heading exists with exact visible text Regex integration', () => {
    const headingMatch = html.match(
        /<h3[^>]*id="chromatic-dialogue-regex-heading"[^>]*>\s*Regex integration\s*<\/h3>/,
    );
    assert.ok(headingMatch);
});

test('5: section references heading via aria-labelledby', () => {
    const sectionMatch = html.match(
        /<section[^>]*id="chromatic-dialogue-regex-section"[^>]*aria-labelledby="chromatic-dialogue-regex-heading"/,
    );
    assert.ok(sectionMatch);
});

test('6: description mentions global SillyTavern Regex scripts', () => {
    assert.match(html, /global(?:\s+SillyTavern)?\s+Regex\s+scripts/i);
});

test('7: description mentions dialogue rendering', () => {
    assert.match(html, /dialogue\s+rendering/i);
});

test('8: description mentions prompt hygiene', () => {
    assert.match(html, /prompt\s+hygiene/i);
});

test('9: status list exists with role=list and aria-label', () => {
    const listMatch = html.match(
        /<div[^>]*id="chromatic-dialogue-regex-status-list"[^>]*role="list"[^>]*aria-label="Required Regex scripts"/,
    );
    assert.ok(listMatch);
});

test('10: exactly two status rows exist with role=listitem', () => {
    const rows = html.match(/class="[^"]*chromatic-dialogue-regex-status-row[^"]*"[^>]*role="listitem"/g);
    assert.equal(rows?.length, 2);
});

test('11: Dialogue display visible label exists', () => {
    assert.match(html, /Dialogue\s+display/);
});

test('12: Dialogue display status element has exact required ID', () => {
    assert.match(html, /id="chromatic-dialogue-regex-dialogue-display-status"/);
});

test('13: Prompt hygiene visible label exists', () => {
    assert.match(html, /Prompt\s+hygiene/);
});

test('14: Prompt hygiene status element has exact required ID', () => {
    assert.match(html, /id="chromatic-dialogue-regex-prompt-hygiene-status"/);
});

test('15: summary exists with role=status and aria-live=polite', () => {
    const summaryMatch = html.match(
        /<p[^>]*id="chromatic-dialogue-regex-summary"[^>]*role="status"[^>]*aria-live="polite"/,
    );
    assert.ok(summaryMatch);
});

test('16: repair button exists exactly once', () => {
    const matches = html.match(/id="chromatic-dialogue-regex-repair"/g);
    assert.equal(matches?.length, 1);
});

test('17: repair button type is button', () => {
    const btnMatch = html.match(/<button[^>]*id="chromatic-dialogue-regex-repair"[^>]*type="button"/);
    assert.ok(btnMatch);
});

test('18: repair button has menu_button and chromatic-dialogue-regex-repair classes', () => {
    const btnMatch = html.match(
        /<button[^>]*id="chromatic-dialogue-regex-repair"[^>]*class="[^"]*\bmenu_button\b[^"]*\bchromatic-dialogue-regex-repair\b[^"]*"/,
    );
    assert.ok(btnMatch);
});

test('19: repair button starts disabled', () => {
    const btnMatch = html.match(/<button[^>]*id="chromatic-dialogue-regex-repair"[^>]*\sdisabled\b/);
    assert.ok(btnMatch);
});

test('20: repair button initially displays Check Regex', () => {
    const btnMatch = html.match(
        /<button[^>]*id="chromatic-dialogue-regex-repair"[^>]*>([\s\S]*?)<\/button>/,
    );
    assert.ok(btnMatch);
    assert.equal(btnMatch[1].trim(), 'Check Regex');
});

test('21: repair button aria-describedby references both summary and feedback', () => {
    const descMatch = html.match(
        /<button[^>]*id="chromatic-dialogue-regex-repair"[^>]*aria-describedby="chromatic-dialogue-regex-summary\s+chromatic-dialogue-regex-feedback"/,
    );
    assert.ok(descMatch);
});

test('22: feedback element has required ID and classes', () => {
    const feedbackMatch = html.match(
        /<p[^>]*id="chromatic-dialogue-regex-feedback"[^>]*class="[^"]*\bchromatic-dialogue-feedback\b[^"]*\bchromatic-dialogue-regex-feedback\b[^"]*"/,
    );
    assert.ok(feedbackMatch);
});

test('23: feedback element has role=status and aria-live=polite', () => {
    const feedbackMatch = html.match(
        /<p[^>]*id="chromatic-dialogue-regex-feedback"[^>]*role="status"[^>]*aria-live="polite"/,
    );
    assert.ok(feedbackMatch);
});

test('24: feedback element starts hidden', () => {
    const feedbackMatch = html.match(
        /<p[^>]*id="chromatic-dialogue-regex-feedback"[^>]*\shidden\b/,
    );
    assert.ok(feedbackMatch);
});

test('25: style.css defines required Regex section classes', () => {
    assert.match(css, /\.chromatic-dialogue-regex-section\b/);
    assert.match(css, /\.chromatic-dialogue-regex-title\b/);
    assert.match(css, /\.chromatic-dialogue-regex-description\b/);
    assert.match(css, /\.chromatic-dialogue-regex-status-list\b/);
    assert.match(css, /\.chromatic-dialogue-regex-status-row\b/);
    assert.match(css, /\.chromatic-dialogue-regex-status-value\b/);
    assert.match(css, /\.chromatic-dialogue-regex-repair\b/);
    assert.match(css, /\.chromatic-dialogue-regex-feedback\b/);
});

test('26: style.css adapts repair button for narrow containers', () => {
    const containerQuery = css.slice(css.indexOf('@container (max-width: 420px)'));
    assert.match(containerQuery, /\.chromatic-dialogue-regex-repair\b/);
});