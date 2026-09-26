import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIALOGUE_TONES } from '../src/dialogue-syntax.js';

describe('Task B2.2: Dialogue Tone Presentation Styles', () => {
  const resolvedCssPath = path.resolve('style.css');
  const cssPath = fs.existsSync(resolvedCssPath)
    ? resolvedCssPath
    : fileURLToPath(new URL('../style.css', import.meta.url));

  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const toneSectionIndex = cssContent.indexOf('Dialogue tone presentation');
  assert.ok(
    toneSectionIndex !== -1,
    'style.css must contain a labeled dialogue tone presentation section'
  );
  const toneSection = cssContent.slice(toneSectionIndex);

  test('A. All four canonical rendered tone selectors exist', () => {
    for (const tone of DIALOGUE_TONES) {
      const toneSelector = `.custom-cd-tone-${tone}`;
      assert.ok(
        cssContent.includes(toneSelector),
        `style.css must contain selector for canonical tone: ${tone}`
      );
      assert.ok(
        cssContent.includes(`#chat .mes_text .custom-cd-tone-${tone}`),
        `style.css must scope tone selector to #chat .mes_text for ${tone}`
      );
    }
  });

  test('B. No unsupported tone selectors are introduced', () => {
    const unsupportedTones = [
      'cry',
      'playful',
      'staccato',
      'normal',
      'quiet',
      'soft',
      'mutter',
      'murmur',
      'yell',
      'scream',
    ];
    for (const tone of unsupportedTones) {
      assert.ok(
        !cssContent.includes(`.custom-cd-tone-${tone}`),
        `style.css must not define selector for unsupported tone: ${tone}`
      );
    }

    const matches = cssContent.matchAll(/\.custom-cd-tone-([a-zA-Z0-9_-]+)/g);
    for (const match of matches) {
      const toneName = match[1];
      assert.ok(
        DIALOGUE_TONES.includes(toneName),
        `Found unexpected tone selector in CSS: .custom-cd-tone-${toneName}`
      );
    }
  });

  test('C. No empty-tone style exists', () => {
    assert.ok(
      !/\.custom-cd-tone-[^a-zA-Z0-9_-]/.test(cssContent),
      'style.css must not define a rule for the inert empty tone class'
    );
  });

  test('D. Whisper contract', () => {
    assert.match(
      toneSection,
      /\.custom-cd-tone-whisper\s*\{[^}]*font-size:\s*0\.88em;/
    );
    assert.match(
      toneSection,
      /\.custom-cd-tone-whisper\s*\{[^}]*font-style:\s*italic;/
    );
    assert.match(
      toneSection,
      /\.custom-cd-tone-whisper\s*\{[^}]*letter-spacing:\s*0\.01em;/
    );
    assert.match(
      toneSection,
      /\.custom-cd-tone-whisper\s+q\s*\{[^}]*font-size:\s*inherit;/
    );
  });

  test('E. Shout contract', () => {
    assert.match(
      toneSection,
      /\.custom-cd-tone-shout\s*\{[^}]*font-size:\s*1\.12em;/
    );
    assert.match(
      toneSection,
      /\.custom-cd-tone-shout\s*\{[^}]*font-weight:\s*800;/
    );
    assert.match(
      toneSection,
      /\.custom-cd-tone-shout\s*\{[^}]*letter-spacing:\s*0\.025em;/
    );
    assert.match(
      toneSection,
      /\.custom-cd-tone-shout\s*\{[^}]*text-shadow:\s*0\s+0\s+0\.28em\s+currentColor;/
    );
    assert.match(
      toneSection,
      /\.custom-cd-tone-shout\s+q\s*\{[^}]*font-size:\s*inherit;/
    );

    // Verify there is no hard-coded shadow color
    const shoutMatch = toneSection.match(
      /\.custom-cd-tone-shout\s*\{([^}]*)\}/
    );
    assert.ok(shoutMatch, 'shout rule block must exist');
    const shadowDeclaration = shoutMatch[1].match(/text-shadow:\s*([^;]+);/);
    assert.ok(shadowDeclaration, 'text-shadow declaration must exist');
    assert.match(
      shadowDeclaration[1],
      /\bcurrentColor\b/,
      'text-shadow must use currentColor'
    );
    assert.ok(
      !/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/i.test(shadowDeclaration[1]),
      'text-shadow must not use hard-coded color values'
    );
  });

  test('F. Measured contract', () => {
    assert.match(
      toneSection,
      /\.custom-cd-tone-measured\s*\{[^}]*font-weight:\s*650;/
    );
    assert.match(
      toneSection,
      /\.custom-cd-tone-measured\s*\{[^}]*letter-spacing:\s*0\.055em;/
    );
    assert.match(
      toneSection,
      /\.custom-cd-tone-measured\s*\{[^}]*word-spacing:\s*0\.04em;/
    );
  });

  test('G. Tremble contract', () => {
    assert.match(
      toneSection,
      /\.custom-cd-tone-tremble\s*\{[^}]*font-style:\s*italic;/
    );
    assert.match(
      toneSection,
      /\.custom-cd-tone-tremble\s*\{[^}]*letter-spacing:\s*0\.08em;/
    );
    assert.match(
      toneSection,
      /\.custom-cd-tone-tremble\s*\{[^}]*word-spacing:\s*0\.035em;/
    );
  });

  test('H. Tone CSS does not own color, background, or opacity', () => {
    const cleanSection = toneSection.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = cleanSection.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('{') || line.startsWith('}')) {
        continue;
      }

      assert.ok(
        !/^(?:color|background|background-color|opacity)\s*:/i.test(line),
        `Tone CSS must not declare color, background, or opacity: ${line}`
      );
    }
  });

  test('I. No animation or jitter effects', () => {
    const cleanSection = toneSection.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = cleanSection.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('{') || line.startsWith('}')) {
        continue;
      }

      assert.ok(
        !/^(?:animation|transform|filter|transition)\s*:/i.test(line),
        `Tone CSS must not declare animation, transform, filter, or transition: ${line}`
      );
    }
  });
});