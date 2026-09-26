# 0.1.0 release checklist

This checklist is for the final Chromatic Dialogue `0.1.0` candidate. It is intentionally conservative: release hardening should not add new runtime architecture.

## Source and metadata

- [ ] `package.json` and `manifest.json` versions match.
- [ ] `manifest.json` entry files exist (`index.js`, `style.css`).
- [ ] `manifest.json` still declares the intended minimum SillyTavern client version.
- [ ] No generated archive, dependency directory, log, secret, or editor artifact is included in the project tree.
- [ ] All JSON files parse successfully.
- [ ] Every `.js` / `.mjs` file passes `node --check`.

## Automated verification

- [ ] `npm test` passes with zero failures.
- [ ] Release-contract tests pass.
- [ ] No test leaves unresolved Automatic queue jobs or pending-store state that can leak into another test.

## Documentation truth

- [ ] README describes Off / Review / Automatic as shipped.
- [ ] README does not claim AI proposals or contrast handling are future work.
- [ ] README explains that pending Review cards are session-only.
- [ ] README explains that pending cards do not reserve IDs.
- [ ] `docs/ai-prompt.md` documents all four macros and the exact `CD_NEW` record shape.
- [ ] AI prompt explicitly forbids HTML `<font>`, named-color, and `:tone` syntax.
- [ ] AI prompt explains that the display Regex supplies quotation marks.
- [ ] Prompt-manager guidance explains that `{{cdState}}` must be reevaluated each generation and uses real multiline text.
- [ ] Release screenshots match the current Review/Automatic UI and responsive layouts.
- [ ] `docs/regex-setup.md` documents both display and prompt-hygiene Regex responsibilities.
- [ ] All local Markdown links resolve to existing files.
- [ ] CHANGELOG describes the release candidate without claiming a release date/tag that has not been created.

## Real SillyTavern smoke test

Use a disposable chat and current installation of the release candidate.

- [ ] Open the extension panel; no new attributable console errors.
- [ ] Manual Add/Edit/Delete works and colors update immediately.
- [ ] Chat switching restores independent assignments and independent operation modes without reload.
- [ ] **Off:** existing colors work; a future valid `CD_NEW` proposal creates no new pending card/assignment.
- [ ] **Review:** one valid proposal creates one pending card; Approve commits it; Dismiss removes only the pending card.
- [ ] Switch between at least one opaque and one semi-transparent/light theme; proposal preparation and approval continue to resolve a usable background and contrast ratio.
- [ ] Narrow the Extensions panel (for example with DevTools open); Review names, contrast metadata, assignment rows, and action buttons remain readable and do not collapse into vertical letter stacks.
- [ ] **Review multi-character:** two valid new speakers in one message approve/dismiss atomically.
- [ ] **Automatic:** a safe valid proposal commits without manual approval and its pending card disappears.
- [ ] **Automatic conflict:** two separate competing proposals for the same free ID do not overwrite the first committed assignment; the unsafe loser remains manual when applicable.
- [ ] **Automatic duplicate:** equivalent repeated proposal reconciles without creating a duplicate assignment.
- [ ] Switching Automatic -> Review -> Off changes future-message behavior immediately without reload.
- [ ] Reload preserves committed assignments and saved mode.
- [ ] Reload intentionally does not reconstruct unresolved pending Review cards.
- [ ] Display Regex colors `[cN]...[/c]` while raw stored message retains the compact marker.
- [ ] Prompt-hygiene Regex removes `CD_NEW` control lines from subsequent outgoing prompt history while leaving `[cN]` markers present.
- [ ] If using a prompt manager, confirm its enabled Chromatic Dialogue slot refreshes `{{cdState}}` on the next generation and disabling the switch removes the directive.

## Candidate archive

- [ ] Build a clean archive from the intended source tree.
- [ ] Inspect archive file list before distribution.
- [ ] `unzip -t` (or equivalent) reports no corruption.
- [ ] Extract candidate to a fresh directory and rerun `npm test`.
- [ ] Extracted candidate passes JS/MJS syntax checks and JSON parsing checks.
- [ ] Install/update from the distribution source and repeat the short SillyTavern smoke test.

## Release record

After every item above passes:

- [ ] Record final automated test count and smoke-test environment in the release notes.
- [ ] Create the `v0.1.0` tag/release only after the candidate is final.
- [ ] Replace `Release candidate` in CHANGELOG with the real release date in the same release commit/tag if desired.
- [ ] Do not claim a published release in README/CHANGELOG before the release actually exists.
