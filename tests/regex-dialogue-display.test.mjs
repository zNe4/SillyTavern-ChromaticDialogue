import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIALOGUE_TONES } from '../src/dialogue-syntax.js';

describe('Task B2.2: Unified Dialogue Display Regex', () => {
  const resolvedPath = path.resolve('docs/regex-dialogue-display.json');
  const jsonPath = fs.existsSync(resolvedPath)
    ? resolvedPath
    : fileURLToPath(new URL('../docs/regex-dialogue-display.json', import.meta.url));

  const jsonRaw = fs.readFileSync(jsonPath, 'utf8');
  let script;

  test('1. JSON parses and expected script identity', () => {
    assert.doesNotThrow(() => {
      script = JSON.parse(jsonRaw);
    });
    assert.ok(script && typeof script === 'object');
    assert.equal(script.id, 'chromatic-dialogue-dialogue-display');
    assert.equal(script.scriptName, 'Chromatic Dialogue - Dialogue display');
  });

  test('2. Correct display-only settings', () => {
    assert.ok(Array.isArray(script.placement));
    assert.equal(script.placement.length, 1);
    assert.equal(script.placement[0], 2);
    assert.equal(script.disabled, false);
    assert.equal(script.markdownOnly, true);
    assert.equal(script.promptOnly, false);
    assert.equal(script.runOnEdit, true);
    assert.equal(script.substituteRegex, 0);
    assert.deepEqual(script.trimStrings, []);
    assert.equal(script.minDepth, 0);
    assert.equal(script.maxDepth, 50);
  });

  function compileRegex() {
    const match = script.findRegex.match(/^\/(.*)\/([a-z]*)$/s);
    assert.ok(match, 'findRegex must be enclosed in /.../flags');
    return new RegExp(match[1], match[2]);
  }

  function applyTransform(input) {
    const re = compileRegex();
    return input.replace(re, script.replaceString);
  }

  test('3. Regex compiles and requires global matching', () => {
    assert.doesNotThrow(() => {
      const re = compileRegex();
      assert.ok(re.flags.includes('g'), 'regex must be global');
    });
  });

  test('4. Replacement exact', () => {
    assert.equal(
      script.replaceString,
      '<span class="cd-c$1 cd-tone-$2">“$3”</span>'
    );
  });

  test('5. Ordinary dialogue still renders with inert cd-tone- class', () => {
    const input = '[c1]Hello.[/c]';
    const expected = '<span class="cd-c1 cd-tone-">“Hello.”</span>';
    assert.equal(applyTransform(input), expected);

    const input3 = '[c3]Hello world.[/c]';
    const expected3 = '<span class="cd-c3 cd-tone-">“Hello world.”</span>';
    assert.equal(applyTransform(input3), expected3);
  });

  test('6. Every canonical tone renders with corresponding classes', () => {
    for (const tone of DIALOGUE_TONES) {
      const input = `[c3:${tone}]Dialogue utterance.[/c]`;
      const expected = `<span class="cd-c3 cd-tone-${tone}">“Dialogue utterance.”</span>`;
      assert.equal(
        applyTransform(input),
        expected,
        `Canonical tone "${tone}" should transform correctly`
      );
    }
  });

  test('7. Vocabulary synchronization with production DIALOGUE_TONES', () => {
    const toneMatch = script.findRegex.match(/:\(([a-z|]+)\)\)\?/);
    assert.ok(toneMatch, 'findRegex must contain explicit tone capture group');
    const regexTones = toneMatch[1].split('|');
    assert.deepEqual(
      [...regexTones].sort(),
      [...DIALOGUE_TONES].sort(),
      'findRegex tones must match DIALOGUE_TONES exactly with no drift'
    );
  });

  test('8. Unsupported tones remain raw', () => {
    const invalidInputs = [
      '[c3:normal]Text.[/c]',
      '[c3:cry]Text.[/c]',
      '[c3:playful]Text.[/c]',
      '[c3:staccato]Text.[/c]',
      '[c3:Whisper]Text.[/c]',
      '[c3:WHISPER]Text.[/c]',
      '[c3: whisper]Text.[/c]',
      '[c3:whisper ]Text.[/c]',
      '[c3:whisper:soft]Text.[/c]',
      '[c3::whisper]Text.[/c]',
      '[c3:]Text.[/c]',
    ];

    for (const input of invalidInputs) {
      assert.equal(
        applyTransform(input),
        input,
        `Unsupported tone syntax must remain raw: ${input}`
      );
    }
  });

  test('9. ID boundaries (c1-c99 valid; c0, c01, c100, C1 raw)', () => {
    assert.equal(
      applyTransform('[c1]First.[/c]'),
      '<span class="cd-c1 cd-tone-">“First.”</span>'
    );
    assert.equal(
      applyTransform('[c99]Last.[/c]'),
      '<span class="cd-c99 cd-tone-">“Last.”</span>'
    );
    assert.equal(
      applyTransform('[c1:whisper]First whisper.[/c]'),
      '<span class="cd-c1 cd-tone-whisper">“First whisper.”</span>'
    );
    assert.equal(
      applyTransform('[c99:shout]Last shout.[/c]'),
      '<span class="cd-c99 cd-tone-shout">“Last shout.”</span>'
    );

    assert.equal(applyTransform('[c0]Text.[/c]'), '[c0]Text.[/c]');
    assert.equal(applyTransform('[c0:whisper]Text.[/c]'), '[c0:whisper]Text.[/c]');
    assert.equal(applyTransform('[c01]Text.[/c]'), '[c01]Text.[/c]');
    assert.equal(applyTransform('[c01:shout]Text.[/c]'), '[c01:shout]Text.[/c]');
    assert.equal(applyTransform('[c100]Text.[/c]'), '[c100]Text.[/c]');
    assert.equal(applyTransform('[c100:measured]Text.[/c]'), '[c100:measured]Text.[/c]');
    assert.equal(applyTransform('[C1]Text.[/c]'), '[C1]Text.[/c]');
    assert.equal(applyTransform('[C1:tremble]Text.[/c]'), '[C1:tremble]Text.[/c]');
  });

  test('10. Multiple mixed markers transform independently and preserve order', () => {
    const input =
      '[c1]Ordinary.[/c]\n' +
      '[c2:whisper]Whisper.[/c]\n' +
      '[c3:shout]Shout.[/c]\n' +
      '[c4:measured]Measured.[/c]\n' +
      '[c5:tremble]Tremble.[/c]';
    const expected =
      '<span class="cd-c1 cd-tone-">“Ordinary.”</span>\n' +
      '<span class="cd-c2 cd-tone-whisper">“Whisper.”</span>\n' +
      '<span class="cd-c3 cd-tone-shout">“Shout.”</span>\n' +
      '<span class="cd-c4 cd-tone-measured">“Measured.”</span>\n' +
      '<span class="cd-c5 cd-tone-tremble">“Tremble.”</span>';

    assert.equal(applyTransform(input), expected);
  });

  test('11. Multiline dialogue supported for ordinary and toned markers', () => {
    const inputOrdinary = '[c1]First line.\nSecond line.[/c]';
    const expectedOrdinary =
      '<span class="cd-c1 cd-tone-">“First line.\nSecond line.”</span>';
    assert.equal(applyTransform(inputOrdinary), expectedOrdinary);

    const inputToned = '[c2:whisper]Whispered line one.\nWhispered line two.[/c]';
    const expectedToned =
      '<span class="cd-c2 cd-tone-whisper">“Whispered line one.\nWhispered line two.”</span>';
    assert.equal(applyTransform(inputToned), expectedToned);
  });

  test('12. Narration preservation outside markers', () => {
    const input =
      'She crept through the doorway.\n' +
      '[c1:whisper]Stay down.[/c]\n' +
      'A twig snapped outside.\n' +
      '[c2:shout]Who goes there?![/c]\n' +
      'Footsteps receded into the darkness.';
    const expected =
      'She crept through the doorway.\n' +
      '<span class="cd-c1 cd-tone-whisper">“Stay down.”</span>\n' +
      'A twig snapped outside.\n' +
      '<span class="cd-c2 cd-tone-shout">“Who goes there?!”</span>\n' +
      'Footsteps receded into the darkness.';

    assert.equal(applyTransform(input), expected);
  });

  test('13. Missing closing marker remains raw', () => {
    const incompleteOrdinary = '[c1]Missing closing bracket.';
    assert.equal(applyTransform(incompleteOrdinary), incompleteOrdinary);

    const incompleteToned = '[c2:whisper]Missing closing bracket.';
    assert.equal(applyTransform(incompleteToned), incompleteToned);

    const onlyClosing = 'Trailing text without opening marker.[/c]';
    assert.equal(applyTransform(onlyClosing), onlyClosing);
  });

  test('14. Non-destructive scope contract', () => {
    assert.equal(script.markdownOnly, true);
    assert.equal(script.promptOnly, false);
    assert.equal(script.runOnEdit, true);
  });
});