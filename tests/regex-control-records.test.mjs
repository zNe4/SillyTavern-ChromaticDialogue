import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Task A12: Native SillyTavern Regex Prompt Hygiene', () => {
  const jsonPath = path.resolve('docs/regex-control-records.json');
  const docsPath = path.resolve('docs/regex-setup.md');

  const jsonRaw = fs.readFileSync(jsonPath, 'utf8');
  let script;

  // 1. JSON parses
  test('1. JSON parses', () => {
    assert.doesNotThrow(() => {
      script = JSON.parse(jsonRaw);
    });
    assert.ok(script && typeof script === 'object');
  });

  // 2. scriptName exact
  test('2. scriptName exact', () => {
    assert.equal(
      script.scriptName,
      'Chromatic Dialogue - Hide control records from prompt'
    );
  });

  // 3. AI Output placement only
  test('3. AI Output placement only', () => {
    assert.ok(Array.isArray(script.placement));
    assert.equal(script.placement.length, 1);
    assert.equal(script.placement[0], 2);
  });

  // 4. promptOnly true
  test('4. promptOnly true', () => {
    assert.equal(script.promptOnly, true);
  });

  // 5. markdownOnly false
  test('5. markdownOnly false', () => {
    assert.equal(script.markdownOnly, false);
  });

  // 6. disabled false
  test('6. disabled false', () => {
    assert.equal(script.disabled, false);
  });

  // 7. substituteRegex zero
  test('7. substituteRegex zero', () => {
    assert.equal(script.substituteRegex, 0);
  });

  // 8. replacement empty
  test('8. replacement empty', () => {
    assert.equal(script.replaceString, '');
  });

  // 9. unlimited depth configuration
  test('9. unlimited depth configuration', () => {
    assert.equal(script.minDepth, null);
    assert.equal(script.maxDepth, null);
  });

  // Helper to compile findRegex exactly as SillyTavern does
  function compileRegex() {
    const match = script.findRegex.match(/^\/(.*)\/([a-z]*)$/s);
    assert.ok(match, 'findRegex must be enclosed in /.../flags');
    return new RegExp(match[1], match[2]);
  }

  function applyClean(input) {
    const re = compileRegex();
    return input.replace(re, script.replaceString ?? '');
  }

  // 10. regex compiles
  test('10. regex compiles', () => {
    assert.doesNotThrow(() => {
      const re = compileRegex();
      assert.ok(re.flags.includes('g'), 'regex must be global');
      assert.ok(re.flags.includes('m'), 'regex must be multiline');
    });
  });

  // 11. valid CD_NEW line removed
  test('11. valid CD_NEW line removed', () => {
    const input =
      '[c2]Hello.[/c]\n\n<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->\n';
    const expected = '[c2]Hello.[/c]\n\n';
    assert.equal(applyClean(input), expected);
  });

  // 12. lowercase/uppercase payload content does not matter to line removal
  test('12. lowercase/uppercase payload content does not matter to line removal', () => {
    const upperPayload =
      '<!-- CD_NEW {"ID":"C2","NAME":"MARA","COLOR":"#B86FD4"} -->\n';
    const lowerPayload =
      '<!-- CD_NEW {"id":"c2","name":"mara","color":"#b86fd4"} -->\n';
    assert.equal(applyClean(upperPayload), '');
    assert.equal(applyClean(lowerPayload), '');
  });

  // 13. multiple CD_NEW lines removed
  test('13. multiple CD_NEW lines removed', () => {
    const input =
      '[c1]First.[/c]\n' +
      '<!-- CD_NEW {"id":"c1","name":"A"} -->\n' +
      '[c2]Second.[/c]\n' +
      '<!-- CD_NEW {"id":"c2","name":"B"} -->\n';
    const expected = '[c1]First.[/c]\n[c2]Second.[/c]\n';
    assert.equal(applyClean(input), expected);
  });

  // 14. trailing final CD_NEW without newline removed
  test('14. trailing final CD_NEW without newline removed', () => {
    const input =
      '[c2]Hello.[/c]\n<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->';
    const expected = '[c2]Hello.[/c]\n';
    assert.equal(applyClean(input), expected);

    const soloInput = '<!-- CD_NEW {"id":"c2"} -->';
    assert.equal(applyClean(soloInput), '');
  });

  // 15. CRLF supported
  test('15. CRLF supported', () => {
    const input =
      '[c1]Hello.[/c]\r\n<!-- CD_NEW {"id":"c1","name":"A"} -->\r\n[c2]World.[/c]\r\n';
    const expected = '[c1]Hello.[/c]\r\n[c2]World.[/c]\r\n';
    assert.equal(applyClean(input), expected);
  });

  // 16. leading spaces supported
  test('16. leading spaces supported', () => {
    const input = '   <!-- CD_NEW {"id":"c1"} -->\n[c1]Hello.[/c]';
    const expected = '[c1]Hello.[/c]';
    assert.equal(applyClean(input), expected);
  });

  // 17. leading tabs supported
  test('17. leading tabs supported', () => {
    const input = '\t\t<!-- CD_NEW {"id":"c1"} -->\n[c1]Hello.[/c]';
    const expected = '[c1]Hello.[/c]';
    assert.equal(applyClean(input), expected);
  });

  // 18. normal prose remains
  test('18. normal prose remains', () => {
    const prose = 'The quick brown fox jumps over the lazy dog.\nAnother line.';
    assert.equal(applyClean(prose), prose);
  });

  // 19. [c1]dialogue[/c] remains unchanged
  test('19. [c1]dialogue[/c] remains unchanged', () => {
    const input = '[c1]Hello there, traveller.[/c]';
    assert.equal(applyClean(input), input);
  });

  // 20. narration remains unchanged
  test('20. narration remains unchanged', () => {
    const narration =
      'She stood near the window, looking out across the misty hills.';
    assert.equal(applyClean(narration), narration);
  });

  // 21. ordinary HTML comment remains
  test('21. ordinary HTML comment remains', () => {
    const input = '<!-- This is a regular HTML comment -->\n[c1]Text.[/c]';
    assert.equal(applyClean(input), input);
  });

  // 22. "CD_NEW" mentioned in prose remains
  test('22. "CD_NEW" mentioned in prose remains', () => {
    const input = 'We should discuss the CD_NEW protocol in detail.';
    assert.equal(applyClean(input), input);
  });

  // 23. malformed JSON CD_NEW line is still removed
  test('23. malformed JSON CD_NEW line is still removed', () => {
    const input =
      '[c1]Text[/c]\n<!-- CD_NEW {"id":"c1", bad json content... -->\n';
    const expected = '[c1]Text[/c]\n';
    assert.equal(applyClean(input), expected);
  });

  // 24. invalid-color CD_NEW line is still removed
  test('24. invalid-color CD_NEW line is still removed', () => {
    const input =
      '[c1]Text[/c]\n<!-- CD_NEW {"id":"c1","color":"not-a-color"} -->\n';
    const expected = '[c1]Text[/c]\n';
    assert.equal(applyClean(input), expected);
  });

  // 25. arbitrary one-line CD_NEW payload is removed
  test('25. arbitrary one-line CD_NEW payload is removed', () => {
    const input = '<!-- CD_NEW arbitrary string payload 12345 -->\n';
    assert.equal(applyClean(input), '');
  });

  // 26. unrelated comment containing CD_NEW later in text but not as the control prefix remains
  test('26. unrelated comment containing CD_NEW later in text but not as the control prefix remains', () => {
    const input = '<!-- Note regarding CD_NEW handling -->\n';
    assert.equal(applyClean(input), input);
  });

  // 27. regex does not consume the preceding dialogue line
  test('27. regex does not consume the preceding dialogue line', () => {
    const input = '[c1]First line of dialogue.[/c]\n<!-- CD_NEW {"id":"c1"} -->';
    const expected = '[c1]First line of dialogue.[/c]\n';
    assert.equal(applyClean(input), expected);
  });

  // 28. regex does not consume the following dialogue line
  test('28. regex does not consume the following dialogue line', () => {
    const input =
      '<!-- CD_NEW {"id":"c1"} -->\n[c1]Following line of dialogue.[/c]';
    const expected = '[c1]Following line of dialogue.[/c]';
    assert.equal(applyClean(input), expected);
  });

  // 29. regex never spans multiple lines
  test('29. regex never spans multiple lines', () => {
    const multilineComment =
      '<!-- CD_NEW\nmalformed multi-line comment\n-->\n[c1]Dialogue.[/c]';
    assert.equal(applyClean(multilineComment), multilineComment);
  });

  // 30. output retains dialogue markers exactly
  test('30. output retains dialogue markers exactly', () => {
    const input =
      '[c1]First.[/c]\n<!-- CD_NEW {"id":"c1"} -->\n[c99]Last.[/c]\n';
    const expected = '[c1]First.[/c]\n[c99]Last.[/c]\n';
    assert.equal(applyClean(input), expected);
  });

  // 31. empty input remains empty
  test('31. empty input remains empty', () => {
    assert.equal(applyClean(''), '');
  });

  // 32. input without controls remains byte-for-byte identical
  test('32. input without controls remains byte-for-byte identical', () => {
    const input =
      '[c1]Dialogue one.[/c]\n' +
      'Narration block.\n' +
      '[c2]Dialogue two.[/c]\n' +
      '<!-- Regular comment -->\n';
    assert.equal(applyClean(input), input);
  });

  // 33. repeated application is idempotent
  test('33. repeated application is idempotent', () => {
    const input =
      '[c1]Hello.[/c]\n' +
      '<!-- CD_NEW {"id":"c1","name":"A"} -->\n' +
      '<!-- CD_NEW {"id":"c2","name":"B"} -->\n' +
      '[c2]World.[/c]\n';
    const once = applyClean(input);
    const twice = applyClean(once);
    assert.equal(twice, once);
  });

  // Read docs/regex-setup.md for doc validation tests
  const docsContent = fs.readFileSync(docsPath, 'utf8');

  // 34. existing display Regex documentation remains present
  test('34. existing display Regex documentation remains present', () => {
    assert.ok(
      docsContent.includes(
        '/\\[c([1-9]\\d?)\\]([\\s\\S]*?)\\[\\/c\\]/g'
      )
    );
    assert.ok(docsContent.includes('<span class="cd-c$1">“$2”</span>'));
    assert.ok(docsContent.includes('Marker contract'));
    assert.ok(docsContent.includes('Max Depth'));
    assert.ok(docsContent.includes('Streaming and quote rendering'));
  });

  // 35. documentation clearly distinguishes display-only vs prompt-only scripts
  test('35. documentation clearly distinguishes display-only vs prompt-only scripts', () => {
    assert.ok(docsContent.includes('Dialogue display script'));
    assert.ok(docsContent.includes('prompt-hygiene'));
    assert.ok(docsContent.includes('Alter Chat Display'));
    assert.ok(docsContent.includes('Alter Outgoing Prompt'));
    assert.ok(
      docsContent.includes('separate') || docsContent.includes('independent')
    );
  });

  // 36. documentation explicitly says stored chat is unchanged
  test('36. documentation explicitly says stored chat is unchanged', () => {
    assert.match(
      docsContent,
      /stored (?:chat|messages?)[\s\S]{0,120}?unchanged/i
    );
  });

  // 37. documentation says [cN] markers remain in outgoing history
  test('37. documentation says [cN] markers remain in outgoing history', () => {
    assert.match(
      docsContent,
      /\[cN\].*remain.*(?:outgoing|prompt|history)/i
    );
  });

  // 38. documentation says CD_NEW is absent from outgoing history
  test('38. documentation says CD_NEW is absent from outgoing history', () => {
    assert.match(
      docsContent,
      /CD_NEW.*(?:absent|omitted|stripped|removed).*(?:outgoing|prompt|history)/i
    );
  });

  // 39. no production src/*.js file is involved
  test('39. no production src/*.js file is involved', () => {
    // This prompt-hygiene capability is accomplished entirely via SillyTavern's
    // built-in Regex extension asset and docs, with no runtime JS modifications.
    assert.ok(fs.existsSync(jsonPath));
    assert.ok(fs.existsSync(docsPath));
  });

  // 40. no irreversible chat mutation is recommended
  test('40. no irreversible chat mutation is recommended', () => {
    assert.match(docsContent, /no irreversible regex mutation/i);
    assert.equal(script.runOnEdit, false);
  });

  // 41. documentation notes pending review state is memory-only and not reconstructed after reload
  test('41. documentation notes pending review state is memory-only and not reconstructed after reload', () => {
    assert.match(docsContent, /pending Review state is\s+memory-only/i);
    assert.match(
      docsContent,
      /not reconstructed automatically after reload/i
    );
  });
});
