import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
    return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

function parseJson(relativePath) {
    return JSON.parse(read(relativePath));
}

function walk(dir) {
    const result = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) result.push(...walk(full));
        else if (entry.isFile()) result.push(full);
    }
    return result;
}

function releaseFacingMarkdownFiles() {
    return [
        'README.md',
        'CHANGELOG.md',
        'roadmap.md',
        'docs/ai-prompt.md',
        'docs/regex-setup.md',
        'docs/release-checklist.md',
    ];
}

test('release contract: package and manifest versions match stable release', () => {
    const pkg = parseJson('package.json');
    const manifest = parseJson('manifest.json');
    assert.equal(pkg.version, manifest.version);
    assert.equal(pkg.version, '1.0.1');
});

test('release contract: manifest entry files exist', () => {
    const manifest = parseJson('manifest.json');
    for (const key of ['js', 'css']) {
        assert.equal(typeof manifest[key], 'string');
        assert.ok(fs.existsSync(path.join(PROJECT_ROOT, manifest[key])));
    }
});

test('release contract: required release documentation exists', () => {
    for (const relativePath of [
        'README.md',
        'CHANGELOG.md',
        'roadmap.md',
        'docs/ai-prompt.md',
        'docs/regex-setup.md',
        'docs/regex-control-records.json',
        'docs/release-checklist.md',
        'docs/development-history.md',
    ]) {
        assert.ok(fs.existsSync(path.join(PROJECT_ROOT, relativePath)), relativePath);
    }
});

test('release contract: README documents all operation modes and AI workflow', () => {
    const readme = read('README.md');
    for (const required of [
        '### Off',
        '### Review',
        '### Automatic',
        '{{cdState}}',
        'CD_NEW',
        'automatic contrast',
        'session-only',
        'do not reserve IDs',
    ]) {
        assert.ok(readme.toLowerCase().includes(required.toLowerCase()), required);
    }
});

test('release contract: README contains no obsolete assignment-only claims', () => {
    const readme = read('README.md');
    const forbidden = [
        'baseline suite contains 53 tests',
        'ai-generated proposals, import/export',
        'automatic contrast checking and palette generation are planned',
        'outgoing prompts are not changed',
        'manages assignments and generated css only',
    ];
    for (const text of forbidden) {
        assert.equal(readme.toLowerCase().includes(text), false, text);
    }
});

test('release contract: recommended AI prompt contains all four macros', () => {
    const promptGuide = read('docs/ai-prompt.md');
    for (const macro of ['{{cdCount}}', '{{cdNext}}', '{{cdRoster}}', '{{cdState}}']) {
        assert.ok(promptGuide.includes(macro), macro);
    }
});

test('release contract: recommended AI prompt documents exact registration shape', () => {
    const promptGuide = read('docs/ai-prompt.md');
    assert.ok(promptGuide.includes('<!-- CD_NEW {"id":"cN","name":"Character Name","color":"#RRGGBB"} -->'));
    assert.ok(promptGuide.includes('[cN]Dialogue[/c]'));
    assert.match(promptGuide, /after (?:all )?visible story/i);
    assert.match(promptGuide, /contiguous (?:registration )?block/i);
    assert.match(promptGuide, /before (?:any )?(?:auxiliary|non-story)/i);
    assert.match(
        promptGuide,
        /(?:no (?:return to )?(?:narration|spoken dialogue|dialogue)|must not be followed by (?:narration|dialogue)|do not resume (?:narration|dialogue))[\s\S]{0,80}?(?:after|registration)/i
    );
    assert.equal(
        promptGuide.includes('must not be followed by narration, dialogue, notes, or any other text'),
        false
    );
});

test('release contract: prompt-manager guidance keeps cdState dynamic and discourages literal newline escapes', () => {
    const readme = read('README.md');
    const promptGuide = read('docs/ai-prompt.md');
    assert.ok(readme.includes('Prompt-manager compatibility'));
    assert.ok(promptGuide.includes('Prompt-manager integration'));
    assert.ok(promptGuide.includes('{{cdState}}'));
    assert.match(promptGuide, /reevaluated each generation/i);
    assert.match(promptGuide, /literal `\\n` characters/i);
    assert.ok(promptGuide.includes('UtilityDirective_ColorFormatting'));
});

test('release contract: AI prompt avoids legacy HTML and tone grammar', () => {
    const promptGuide = read('docs/ai-prompt.md');
    assert.ok(promptGuide.includes('Do not use HTML <font> tags, named-color tags, or :tone syntax.'));
    assert.ok(promptGuide.includes('Do not put quotation marks inside [cN]...[/c]'));
});

test('release contract: pending Review ephemerality is explicit in docs and UI', () => {
    const readme = read('README.md');
    const promptGuide = read('docs/ai-prompt.md');
    const settings = read('settings.html');
    assert.match(readme, /Pending Review cards are intentionally \*\*session-only\*\*/);
    assert.match(promptGuide, /Pending Review cards are session memory/);
    assert.match(settings, /Pending reviews are session-only until accepted\./);
});

test('release contract: Regex guide links the AI prompt and separates responsibilities', () => {
    const regexGuide = read('docs/regex-setup.md');
    assert.ok(regexGuide.includes('[recommended AI prompt](ai-prompt.md)'));
    assert.ok(regexGuide.includes('Dialogue display script'));
    assert.ok(regexGuide.includes('Control-record prompt-hygiene script'));
});

test('release contract: current release screenshots exist and stale screenshot names are gone', () => {
    const required = [
        'docs/images/chromatic-dialogue-responsive-light.png',
        'docs/images/chromatic-dialogue-responsive-dark.png',
        'docs/images/chromatic-dialogue-rp-before-approval.png',
        'docs/images/chromatic-dialogue-raw-proposal.png',
        'docs/images/chromatic-dialogue-review-pending.png',
        'docs/images/chromatic-dialogue-assignments-approved.png',
        'docs/images/chromatic-dialogue-rp-after-approval.png',
    ];
    for (const relativePath of required) {
        assert.ok(fs.existsSync(path.join(PROJECT_ROOT, relativePath)), relativePath);
        assert.ok(fs.statSync(path.join(PROJECT_ROOT, relativePath)).size > 0, relativePath);
    }
    for (const stale of [
        'docs/images/chromatic-dialogue-desktop-dark.png',
        'docs/images/chromatic-dialogue-desktop-light.png',
        'docs/images/chromatic-dialogue-mobile-narrow.png',
    ]) {
        assert.equal(fs.existsSync(path.join(PROJECT_ROOT, stale)), false, stale);
    }
});

test('release contract: README references current workflow and responsive screenshots', () => {
    const readme = read('README.md');
    for (const image of [
        'chromatic-dialogue-rp-after-approval.png',
        'chromatic-dialogue-raw-proposal.png',
        'chromatic-dialogue-review-pending.png',
        'chromatic-dialogue-assignments-approved.png',
        'chromatic-dialogue-responsive-light.png',
        'chromatic-dialogue-responsive-dark.png',
    ]) {
        assert.ok(readme.includes(`docs/images/${image}`), image);
    }
});

test('release contract: changelog describes current AI/Automatic feature set', () => {
    const changelog = read('CHANGELOG.md');
    for (const required of [
        '[1.0.0] - 2026-09-26',
        'first stable public release',
        'Automatic',
        'CD_NEW',
        'contrast',
        'session-only',
        'first-success-wins',
    ]) {
        assert.ok(changelog.toLowerCase().includes(required.toLowerCase()), required);
    }
});

test('release contract: roadmap identifies 1.0.0 stable release scope', () => {
    const roadmap = read('roadmap.md');
    assert.ok(roadmap.includes('1.0.0'));
    assert.ok(roadmap.includes('first stable release'));
    assert.ok(roadmap.includes('unresolved Review cards'));
    assert.ok(roadmap.includes('docs/development-history.md'));
});

test('release contract: all release-facing local Markdown links resolve', () => {
    const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
    for (const relativePath of releaseFacingMarkdownFiles()) {
        const text = read(relativePath);
        const baseDir = path.dirname(path.join(PROJECT_ROOT, relativePath));
        for (const match of text.matchAll(linkPattern)) {
            let target = match[1].trim();
            if (!target || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
            target = target.split('#', 1)[0];
            if (!target) continue;
            const resolved = path.resolve(baseDir, decodeURIComponent(target));
            assert.ok(fs.existsSync(resolved), `${relativePath} -> ${match[1]}`);
        }
    }
});

test('release contract: every project JSON file parses', () => {
    const jsonFiles = walk(PROJECT_ROOT).filter(file => file.endsWith('.json'));
    assert.ok(jsonFiles.length >= 3);
    for (const file of jsonFiles) {
        assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')), path.relative(PROJECT_ROOT, file));
    }
});

test('release contract: all JavaScript and MJS files pass node --check', () => {
    const jsFiles = walk(PROJECT_ROOT).filter(file => /\.(?:m?js)$/.test(file));
    assert.ok(jsFiles.length > 0);
    for (const file of jsFiles) {
        assert.doesNotThrow(() => {
            execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
        }, path.relative(PROJECT_ROOT, file));
    }
});

test('release contract: archive tooling is not shipped inside the extension repository', () => {
    assert.equal(fs.existsSync(path.join(PROJECT_ROOT, 'scripts')), false);
    const readme = read('README.md');
    assert.equal(readme.includes('scripts/archive-project.sh'), false);
});

test('release contract: project tree contains no packaged archives or dependency directories', () => {
    const allFiles = walk(PROJECT_ROOT);
    const forbiddenFile = allFiles.find(file => /\.(?:zip|tar|tgz|7z)$/i.test(file));
    assert.equal(forbiddenFile, undefined);
    assert.equal(fs.existsSync(path.join(PROJECT_ROOT, 'node_modules')), false);
});