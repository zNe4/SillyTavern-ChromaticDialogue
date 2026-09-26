# Chromatic Dialogue — Project Roadmap

> Living source of truth for the design, implementation, testing, and release of
> the Chromatic Dialogue SillyTavern UI extension.

## Project status

- Current phase: **Phase 7 in progress — v0.1.0 pre-push documentation acceptance passed**
- Target SillyTavern version: **1.18.0+**
- Reference installation: **1.18.0-1-g8172dcd0e**
- First release target: **v0.1.0**
- Implementation status: **Phases 1 through 6 complete; Phase 7 documentation/version/screenshots accepted in Firefox, responsive layouts, and focused physical Android without runtime changes**
- Repository: **https://github.com/zNe4/SillyTavern-ChromaticDialogue**
- Latest implementation checkpoint: **`1d6864c0f35f9809cbf124f3deea0dbcc26a4d73` — Phase 6 hardening published and distribution-accepted**
- Verification baseline: **53 passing tests; Firefox 153 desktop/NanoGPT; six themes; README-led Firefox and Regex walkthrough; 390 × 844 and 360 × 780 responsive gates; physical Samsung Note 20 Ultra/Opera/Termux usability and documentation confirmation; real Phase 5 update and fresh GitHub installation; exact cleanup**
- Next action: Review and apply the Phase 7 documentation-acceptance evidence record, then normally commit and push the accepted candidate before public distribution gates.

Update this section whenever a phase begins or finishes.

---

## 1. Product goal

Build a lightweight, browser-side SillyTavern UI extension that manages
color-coded NPC dialogue assignments independently for many unrelated roleplay
chats.

The central design is:

```text
AI writes:
[c1]Dialogue[/c]

The built-in Regex replacement emits:

<span class="cd-c1">“Dialogue”</span>

SillyTavern automatically prefixes and renders:
<span class="custom-cd-c1">“Dialogue”</span>

Chromatic Dialogue stores:
c1 = Catherine = #56B4E9

Chromatic Dialogue generates:
#chat .mes_text .custom-cd-c1,
#chat .mes_text .custom-cd-c1 q { color: #56B4E9; }
```

The project deliberately separates three responsibilities:

1. **Marker protocol:** The AI produces compact `[cN]...[/c]` markers.
2. **Display transformation:** SillyTavern's built-in Regex extension converts
   markers to safe display HTML.
3. **Assignment management:** Chromatic Dialogue stores character mappings and
   supplies the corresponding CSS.

The MVP must not parse or rewrite dialogue messages itself.

---

## 2. Success criteria

The project is successful when:

- Each chat can have an independent mapping from `c1` through `c99`.
- Users can add, edit, and delete assignments without editing JSON or CSS.
- Switching chats immediately loads the correct mappings and colors.
- Raw compact markers remain stored in the chat.
- The outgoing prompt is not modified by the display Regex.
- Missing or misconfigured Regex causes visible raw markers, not extension
  failure or data loss.
- The extension uses negligible CPU while idle.
- No server-side plugin or external service is required.
- Installation works by pasting the GitHub repository URL into SillyTavern's
  Extension Manager.
- The interface remains usable on a phone running SillyTavern through Termux.

---

## 3. Fixed technical decisions

| Area | Decision |
| --- | --- |
| Working name | Chromatic Dialogue |
| Repository | `zNe4/SillyTavern-ChromaticDialogue` |
| Extension type | Browser-side SillyTavern UI extension |
| Runtime | Native JavaScript ES modules |
| Framework | None |
| Runtime dependencies | None |
| Build step | None for the MVP |
| Minimum ST version | `1.18.0` |
| Initial UI location | Extensions settings panel |
| MVP storage scope | Current chat only |
| Chat metadata key | `chromatic_dialogue` |
| Assignment IDs | `c1` through `c99` |
| Color format | Six-digit hexadecimal |
| Generated style ID | `chromatic-dialogue-generated-styles` |
| Initial quote style | Fixed curly quotes supplied by Regex |
| Initial Regex depth recommendation | Min `0`, Max `50` |
| Automatic mapping changes | Never without user approval |
| Group chats | Deferred until after the MVP |
| AI proposal detection | Deferred until after the MVP |

These decisions may change only after recording the reason in the Decision Log.

---

## 4. Explicit non-goals for the MVP

The v0.1.0 MVP will not:

- Replace SillyTavern's Regex extension.
- Install or silently modify Regex scripts.
- Implement a custom chat-message parser.
- Scan the chat DOM continuously.
- Use `MutationObserver`, polling, or background intervals.
- Store rendered HTML in chat metadata or chat messages.
- Add hexadecimal colors to the AI prompt.
- Support character-card defaults.
- Support global assignment defaults.
- Register `{{dialogueColorMap}}`.
- Detect `CD_NEW` proposals.
- Import or export mappings.
- Generate palettes or calculate contrast.
- Add a Magic Wand shortcut.
- Implement special group-chat behavior.
- Add localization.
- Require a server plugin, Extras, database, or external API.

---

## 5. Repository and extension structure

The Git repository must represent exactly one extension. `manifest.json` must be
at the repository root so SillyTavern's Extension Manager can install it
directly.

```text
SillyTavern-ChromaticDialogue/
├── manifest.json
├── index.js
├── settings.html
├── style.css
├── global.d.ts
├── package.json
├── CHANGELOG.md
├── roadmap.md
├── src/
│   ├── constants.js
│   ├── domain.js
│   ├── chat-store.js
│   ├── style-manager.js
│   ├── style-runtime.js
│   └── panel.js
├── tests/
│   └── *.test.mjs
├── docs/
│   └── regex-setup.md
├── scripts/
│   └── archive-project.sh
├── README.md
├── LICENSE
└── .gitignore
```

### File responsibilities

| File | Responsibility |
| --- | --- |
| `manifest.json` | Extension metadata and entry points |
| `index.js` | Bootstrap, lifecycle, and application event registration |
| `settings.html` | Static management-panel template |
| `style.css` | Static panel layout and mobile styles |
| `global.d.ts` | SillyTavern global types for editor/LSP support |
| `package.json` | Local syntax and Node test commands; no runtime dependency bundle |
| `CHANGELOG.md` | Durable user-visible release history |
| `roadmap.md` | Living implementation plan, decisions, and verified checkpoints |
| `src/constants.js` | Metadata key, DOM IDs, selector, and limits |
| `src/domain.js` | Schema, validation, normalization, and pure transformations |
| `src/chat-store.js` | Current-chat metadata reads and writes |
| `src/style-manager.js` | Dedicated generated-style lifecycle |
| `src/style-runtime.js` | Translate active-chat storage state into generated CSS updates |
| `src/panel.js` | UI rendering, form handling, and user feedback |
| `tests/*.test.mjs` | Domain, storage, and lifecycle regression coverage |
| `docs/regex-setup.md` | Exact built-in Regex configuration |
| `scripts/archive-project.sh` | Create clean project snapshots for review |
| `README.md` | Installation, usage, limitations, and troubleshooting |

No `node_modules`, compiled bundle, generated assets, or SillyTavern source files
should be committed.

### Project snapshot archives

Run:

```bash
chmod +x scripts/archive-project.sh
./scripts/archive-project.sh
```

The script archives Git-tracked files plus untracked files that are not ignored
by `.gitignore`. This lets snapshots follow the project automatically as files
are added, without maintaining a hardcoded allowlist.

It excludes:

- `.git` internals;
- dependencies, caches, build output, and coverage;
- existing archives;
- logs and editor swap/backup files;
- common secret and credential files;
- SillyTavern `data`, `config.yaml`, and `secrets.json`.

By default, the ZIP is written beside the repository and named with the UTC
timestamp, current commit, and a `dirty` suffix when appropriate. Keeping the
archive outside the repository prevents it from including itself.

Useful options:

```bash
./scripts/archive-project.sh --list
./scripts/archive-project.sh --tracked-only
./scripts/archive-project.sh --output ../chromatic-dialogue-review.zip
```

The script requires `git` and `zip`. If `unzip` is installed, it also verifies
the resulting archive before reporting success.

---

## 6. GitHub installation and distribution

### Direct installation

SillyTavern already supports direct installation from a Git repository:

1. Publish the repository publicly on GitHub.
2. Keep `manifest.json` at the repository root.
3. In SillyTavern, open **Extensions → Install Extension**.
4. Paste the repository URL.
5. Select the branch if necessary; the default should be `main`.
6. Choose the user/all-users installation target when offered.
7. SillyTavern clones and loads the extension automatically.

No ZIP package, GitHub Release asset, npm publication, installer script, or
server plugin is required for normal installation.

Expected URL shape:

```text
https://github.com/zNe4/SillyTavern-ChromaticDialogue
```

### Repository requirements

- Public Git repository.
- Default branch named `main`.
- Valid root-level `manifest.json`.
- Entry files referenced by the manifest must exist with matching case.
- No Git submodules.
- No authentication requirement.
- No post-install script.
- No build step required after cloning.
- A libre/open-source license before public release.
- README with installation, setup, usage, compatibility, and limitations.

### Manifest requirements

The initial manifest will need:

- `display_name`
- `loading_order`
- `js`
- `css`
- `author`
- `version`
- `homePage`
- `auto_update`
- `minimum_client_version`

Planned values:

| Field | Planned value |
| --- | --- |
| `display_name` | `Chromatic Dialogue` |
| `js` | `index.js` |
| `css` | `style.css` |
| `version` | `0.1.0` for the first release |
| `homePage` | `https://github.com/zNe4/SillyTavern-ChromaticDialogue` |
| `auto_update` | `true` |
| `minimum_client_version` | `1.18.0` |

The planned `author` value is `zNe4` unless a different public author label is
chosen before the manifest is created.

### Updates

- Increment the manifest version for user-facing releases.
- Keep `main` installable.
- Tag stable releases, beginning with `v0.1.0`.
- Test Extension Manager update behavior before announcing v0.1.0.
- Avoid force-pushing published release tags.
- Publish a GitHub Release page for `v0.1.0` after acceptance and user approval;
  it is useful release history but is not required for installation.

### Optional official catalog submission

Direct URL installation does not require approval from SillyTavern.

Appearing in SillyTavern's endorsed community extension catalog is a separate,
later step. It requires:

- Open-source/libre licensing.
- Compatibility with the latest SillyTavern release.
- Complete documentation.
- No required server plugin.
- A record added to the official `SillyTavern-Content` extension index through
  its contribution process.

Catalog submission is a post-v1.0 objective, not an MVP blocker.

---

## 7. Data model

### Chat metadata

Planned metadata:

```json
{
  "chromatic_dialogue": {
    "schemaVersion": 1,
    "assignments": {
      "c1": {
        "name": "Catherine",
        "color": "#56B4E9"
      },
      "c2": {
        "name": "Daniel",
        "color": "#E69F00"
      }
    }
  }
}
```

### Validation rules

- Metadata container must be a plain JSON-serializable object.
- `schemaVersion` must be recognized; missing version is normalized safely.
- `assignments` must be an object keyed by canonical marker ID.
- Valid ID expression: `^c(?:[1-9]|[1-9][0-9])$`
- IDs normalize to lowercase.
- Names are required and trimmed.
- Names are rendered as text, never injected as HTML.
- Hex expression: `^#[0-9A-Fa-f]{6}$`
- Colors normalize to uppercase.
- Duplicate IDs are rejected.
- Duplicate names are allowed in the MVP.
- Duplicate colors are allowed in the MVP.
- Unknown fields are ignored.
- Malformed entries are skipped rather than crashing the extension.
- No active chat produces an empty, non-editable state.

### Future precedence

When later scopes exist:

```text
chat assignment
    overrides
character-card default
    overrides
global default
```

Precedence is computed at runtime; inherited defaults must not be copied
silently into every chat.

---

## 8. Runtime architecture

### Initialization

1. Load the extension entry point.
2. Register for the appropriate SillyTavern ready event.
3. Initialize exactly once.
4. Render the settings panel.
5. Read current chat metadata on demand.
6. Render current assignments.
7. replace the generated CSS.
8. Register chat-change handling.

### Add/edit/delete operation

1. Read and normalize form values.
2. Validate name, ID, and color.
3. Capture the current chat identity.
4. Re-check that the active chat did not change.
5. Obtain the current `chatMetadata` reference from `getContext()`.
6. Write a validated, JSON-serializable state.
7. Await `saveMetadata()`.
8. Regenerate CSS.
9. Rerender the table.
10. Show accessible success or failure status inside the extension panel.

Optional SillyTavern toast notifications for successful CRUD operations are a
future usability enhancement; they must supplement rather than replace the
accessible in-panel status.

Never cache `chatMetadata` in a long-lived variable because SillyTavern replaces
the reference when the active chat changes.

### Chat switching

On `eventTypes.CHAT_CHANGED`:

1. Invalidate transient UI editing state.
2. Read the new active chat's metadata.
3. Replace generated CSS.
4. Render the new table.
5. Display the no-chat state if applicable.

### Performance model

The extension should perform work only:

- once at initialization;
- after an explicit CRUD operation;
- when the active chat changes.

It should be idle at all other times.

---

## 9. Built-in Regex contract

### Candidate script

Find:

```regex
/\[c([1-9]\d?)\]([\s\S]*?)\[\/c\]/g
```

Replace:

```html
<span class="cd-c$1">“$2”</span>
```

SillyTavern automatically prefixes that authored class in rendered chat, so
Chromatic Dialogue targets the resulting `custom-cd-cN` DOM class.

### Required configuration

- Script scope: Global
- Affects: AI Response
- Run on Edit: enabled
- Macros in Find Regex: Don't Substitute
- Alter Chat Display: enabled
- Alter Outgoing Prompt: disabled
- Disabled: off
- Min Depth: `0`
- Recommended Max Depth: `50`
- User setting “Show `<tags>` in responses”: unchecked

### Important behavior

- The chat file keeps `[cN]...[/c]`.
- The AI continues receiving compact markers in history.
- Only the rendered chat receives the `<span>`.
- A missing Regex script leaves raw markers visible.
- Messages beyond Max Depth may show raw markers; users who want the entire
  transcript formatted can use Unlimited.
- A marker may temporarily appear incomplete during streaming until `[/c]`
  arrives.
- Nested markers are invalid.
- Narration and actions must remain outside markers.

### Quote-style limitation

The extension cannot dynamically change quotes that are inserted by a
user-managed Regex script. The MVP therefore uses fixed curly quotes.

A later version may move quote glyphs to CSS pseudo-elements, but only after
testing selection, copying, screen readers, and mobile rendering.

---

## 10. Generated CSS contract

The extension owns one style element:

```html
<style id="chromatic-dialogue-generated-styles"></style>
```

Candidate generated rule:

```css
#chat .mes_text .custom-cd-c1,
#chat .mes_text .custom-cd-c1 q {
  color: #56B4E9;
}
```

Requirements:

- Verify the chat-content selector against SillyTavern 1.18.0.
- Keep the selector in one constant.
- Generate only rules for valid assignments.
- Use validated marker IDs and colors only.
- Replace the style element's `textContent`.
- Never append an unbounded number of style elements.
- Clear the style contents when no mappings or no chat exist.
- Avoid `!important` unless theme testing proves it necessary.
- Scope rules to chat-message content to prevent class collisions elsewhere.

---

## 11. MVP interface

### Panel placement

Use the documented Extensions settings container for v0.1.0. Defer Magic Wand
integration until the core is stable.

### Empty/no-chat states

- No selected chat: explain that assignments require an active chat and disable
  the form.
- Active chat with no data: show “No assignments for this chat.”

### Current assignments

Display:

- marker ID;
- character name;
- hex color;
- color preview;
- scope label fixed to “Current chat”;
- edit action;
- delete action.

### Add/edit form

Fields:

- character name;
- compact marker ID;
- hex color text field;
- native color picker;
- live preview.

Behavior:

- Text and native color inputs stay synchronized.
- Invalid input explains the exact rule.
- An add operation cannot overwrite an existing ID.
- An edit preserves the original entry until validation and saving succeed.
- Delete requires confirmation if accidental deletion is likely on mobile.

### Mobile requirements

- No horizontal page overflow.
- Form fields stack vertically at narrow widths.
- Touch targets are comfortably sized.
- Table may become assignment cards on small screens.
- Essential actions do not depend on hover.
- Panel remains usable with the mobile keyboard open.

---

## 12. Implementation phases

Each phase must meet its exit criteria before the next phase begins.

### Phase 0 — Regex and compatibility spike

Status: **Complete; remaining integration checks are assigned to later phases**

Tasks:

- [x] Create the candidate global Regex script manually.
- [x] Test the expression in Regex Test Mode.
- [x] Verify actual chat rendering.
- [x] Verify the output `<span>` survives sanitization during normal rendering.

Carried forward:

- Confirm raw-marker storage and outgoing-prompt behavior during Phase 6.
- Use the verified `#chat .mes_text` content scope and `custom-cd-cN`
  rendered-class contract.
- Test multiline, multiple-marker, edit, and streaming behavior during Phase 6.
- Record mobile differences during Phase 6.

Test inputs:

```text
[c1]Good morning.[/c]
```

```text
[c1]First speaker.[/c]

Narration between them.

[c2]Second speaker.[/c]
```

```text
[c1]A dialogue
spanning two lines.[/c]
```

Malformed inputs:

```text
[c0]Invalid.[/c]
[c01]Invalid.[/c]
[c100]Invalid.[/c]
[c1]Missing closing marker.
```

Exit criteria:

- The Regex contract is proven independently of the extension.
- The working find/replace values and settings are recorded in this roadmap.
- Creation of the final `docs/regex-setup.md` is assigned to Phase 1.
- Remaining integration checks have explicit later owners.

Suggested commit after documentation exists:

```text
docs: define regex display contract
```

### Phase 1 — Loadable extension skeleton

Status: **Complete**

Tasks:

- [x] Create the Git repository.
- [x] Select the final GitHub repository name.
- [x] Add license.
- [x] Create valid `manifest.json`.
- [x] Create `index.js`, `settings.html`, and `style.css`.
- [x] Add `global.d.ts` for Neovim LSP support.
- [x] Add and validate `scripts/archive-project.sh`.
- [x] Register an idempotent initialization path.
- [x] Render an empty Chromatic Dialogue settings panel.
- [x] Show no-chat and no-assignment states.
- [x] Confirm no console errors.
- [x] Push the repository to GitHub.
- [x] Install a clean copy using the Extension Manager and repository URL.

Exit criteria:

- Extension loads on desktop from a direct development checkout.
- Extension installs and loads from its GitHub URL.
- Reloading the page does not duplicate the panel.
- No runtime error appears in the browser console.

Completed scaffold commit:

```text
7d35ef1 chore: scaffold Chromatic Dialogue extension
```

### Phase 2 — Domain model and chat storage

Status: **Complete**

Tasks:

- [x] Define schema version 1.
- [x] Implement pure ID validation.
- [x] Implement name normalization.
- [x] Implement hex validation and normalization.
- [x] Implement safe state normalization.
- [x] Read metadata from the active chat on demand.
- [x] Save metadata with `saveMetadata()`.
- [x] Avoid retaining the `chatMetadata` reference.
- [x] Handle no active chat.
- [x] Handle missing metadata.
- [x] Handle partially malformed metadata.
- [x] Protect against a chat switch during an edit/save operation.

Exit criteria:

- A valid mapping survives browser reload.
- The mapping exists only in its original chat.
- Malformed metadata cannot crash initialization.
- Invalid values are never persisted by the UI.

Verified:

- 20 passing tests: 10 domain, 9 storage, and 1 Phase 1 lifecycle test.
- A valid assignment persisted after a full browser reload.
- Two chats retained isolated assignment states in both switching directions.
- Intentionally malformed metadata normalized to a safe empty state and was
  restored without console errors.
- A chat change before or during asynchronous persistence is reported safely.
- Temporary manual-test metadata was removed after verification.

Completed commit:

```text
6e1621a feat: add per-chat assignment state storage
```

### Phase 3 — Dynamic CSS manager

Status: **Complete**

Tasks:

- [x] Confirm the final chat-content selector against the reference
      SillyTavern installation.
- [x] Confirm the rendered Regex class contract as `custom-cd-c1` through
      `custom-cd-c99`.
- [x] Create or reuse the dedicated style element.
- [x] Generate scoped rules from normalized mappings.
- [x] Replace existing generated CSS atomically.
- [x] Clear rules for empty/no-chat state.
- [x] Reject unvalidated IDs, names, and colors.
- [x] Test theme specificity.
- [x] Verify that style updates require no message DOM traversal.
- [x] Refresh generated CSS through the existing chat lifecycle without
      polling, observers, intervals, or continuous scanning.

Verified selector contract:

```css
#chat .mes_text .custom-cd-c1 {
    color: #56B4E9;
}
```

Exit criteria:

- [x] Changing a saved color immediately changes rendered dialogue.
- [x] Exactly one generated style element exists.
- [x] Switching to an empty chat removes previous-chat colors.
- [x] Reopening a mapped chat restores its saved colors.
- [x] The extension changes CSS only, not message content.
- [x] No polling, observer, background interval, or continuous DOM scan was
      introduced.

Completed commit:

```text
c43821b feat: add dynamic dialogue CSS manager
```

### Phase 4 — Manual assignment CRUD

Status: **Complete**

Tasks:

- [x] Render current assignments.
- [x] Add assignment form.
- [x] Synchronize hex field and color picker.
- [x] Add live preview.
- [x] Implement add.
- [x] Implement edit.
  - [x] Load a selected assignment into the form without saving.
  - [x] Persist validated edits and refresh CSS and panel state.
- [x] Implement delete.
- [x] Reject duplicate IDs.
- [x] Provide clear validation feedback.
- [x] Disable editing without an active chat.
- [x] Ensure names are rendered as text.
- [x] Build responsive mobile layout.

Exit criteria:

- [x] All assignment management is possible without DevTools or manual JSON
      edits.
- [x] Failed validation never alters the existing mapping.
- [x] Successful add operations persist and update CSS immediately.
- [x] Successful edit and delete operations persist and update CSS immediately.
- [x] The implemented interface remains usable on a phone.

Planned completion commit:

```text
feat: complete manual assignment CRUD
```

### Phase 5 — Chat-change synchronization

Status: **Complete**

Tasks:

- [x] Listen for `eventTypes.CHAT_CHANGED`.
- [x] Invalidate open edit state on chat switch.
- [x] Load the new chat's mappings.
- [x] Rerender the table.
- [x] Replace generated CSS.
- [x] Test rapid repeated switching.
- [x] Test new-chat creation.
- [x] Test no-character/no-chat state.

Required scenario:

```text
Chat A: c1 = Catherine = #56B4E9
Chat B: c1 = Daniel    = #E69F00
```

Exit criteria:

- [x] Table and colors always match the active chat.
- [x] No assignment leaks between chats.
- [x] No stale save writes to the wrong chat.
- [x] Switching does not duplicate event listeners or UI.

Planned completion commit:

```text
feat: synchronize assignments on chat change
```

### Phase 6 — MVP hardening and mobile verification

Status: **Complete**

Tasks:

- [x] Test IDs `c1`, `c9`, `c10`, and `c99`.
- [x] Reject `c0`, `c01`, `c100`, and arbitrary classes. Normalize
      uppercase input such as `C1` to canonical `c1`, and detect duplicates
      after normalization.
- [x] Test empty, whitespace-only, Unicode, and long names.
- [x] Test lowercase and uppercase hex input.
- [x] Test deletion and re-adding the same ID.
- [x] Test message edits.
- [x] Test swipes and regeneration.
- [x] Test streaming.
- [x] Test page reload.
- [x] Test multiple themes.
- [x] Test Firefox on desktop.
- [x] Defer Chromium desktop with an explicit reason: Chromium is unavailable
      in the current test environment.
- [x] Test the Termux-hosted installation on a physical phone through a
      human-only usability attestation.
- [x] Test GitHub installation.
- [x] Test Extension Manager update from the public Phase 5 checkpoint.
- [x] Review console logging and remove debug noise.
- [x] Review accessibility labels and keyboard navigation.

Pre-push evidence recorded on 2026-08-01:

- Automated verification passed **53/53 tests** with **20/20** JavaScript/MJS
  syntax checks. Focused quote-color regression passed **9/9** tests.
- Boundary IDs, invalid IDs, duplicate `C1`, canonical lowercase storage,
  lowercase/uppercase hexadecimal input, empty/whitespace names, Unicode and
  long names, delete/re-add, numeric ordering, reload reconstruction, and safe
  text rendering passed.
- Firefox **153.0** on Linux/X11 passed the desktop gate. NanoGPT streaming with
  a decentralized Llama 3.1 8B model transformed markers once a complete valid
  tag was present. Final streaming, swipe, regeneration, and edited messages
  used the expected marker classes and colors without changing assignment
  metadata or duplicating the panel/style lifecycle.
- Theme coverage passed in **Azure**, **Dark Lite**, **Celestial Macaron**,
  **Cappuccino**, **Moonlit Echoes**, and **Violet Glass Light**. Theme quote
  rules initially exposed a nested-`<q>` color override; the focused fix now
  colors both `.custom-cd-cN` and its nested `q` without `!important`, message
  traversal, or Regex changes. The corrected visible `c1` color was verified
  as `rgb(86, 180, 233)` in Dark Lite and Violet Glass Light.
- Keyboard traversal had logical order, visible focus, named controls,
  working activation/cancellation, and no trap. No new uncaught or Chromatic
  Dialogue-attributable console error appeared.
- Firefox Responsive Design Mode passed at **390 × 844** and **360 × 780** CSS
  pixels with readable long names, reachable fields/actions, coherent layout,
  theme contrast, and no duplicate panel, rows, or generated style.
- Physical Android human-usability confirmation passed on a **Samsung Note 20
  Ultra**, portrait orientation, using **Opera 100.2.5122.89341** with its own
  Termux-hosted SillyTavern installation. Settings expansion, long-name
  readability, mobile-keyboard entry, color picker/hex input, edit/cancel,
  delete/re-add, layout, and navigation back to chat all passed. The disposable
  assignment was cleaned up. Missing viewport telemetry was not treated as a
  failure.
- The Termux runtime sync began from public Phase 5 commit
  `64e468c0d7584355b00884fed2cea0e7b2d20dd9`, copied exactly the five reviewed
  runtime files, preserved all non-target extension content and Git identity,
  and reproduced **53/53** tests.
- The disposable Firefox chat was restored exactly to its original `c1` and
  `c50` metadata. All snapshot and message guards were closed.
- Chromium desktop remains explicitly deferred because it is unavailable.

Post-push distribution evidence recorded on 2026-08-01:

- The reviewed implementation was normally committed and pushed as
  `1d6864c0f35f9809cbf124f3deea0dbcc26a4d73` with subject
  `fix: harden MVP behavior across desktop and mobile`. Local `main` and
  fetched `origin/main` matched with a clean worktree.
- A separate global installation in disposable SillyTavern **1.18.0** began at
  public Phase 5 commit `64e468c0d7584355b00884fed2cea0e7b2d20dd9`.
  SillyTavern's Extension Manager performed a real `git pull` fast-forward to
  the Phase 6 commit. The Phase 5 `c1` mapping survived exactly; panel loading,
  basic CRUD, reload persistence, one generated style element, zero attributable
  console errors, and cleanup all passed.
- The updated extension was removed through the Extension Manager and installed
  again globally from the public GitHub URL. The new depth-1 `main` clone had a
  one-entry clone reflog at the exact Phase 6 commit, proving that the old clone
  was removed rather than reused.
- Both machine captures matched all **31** reviewed project files, preserved all
  non-target extension siblings, passed **20/20** syntax checks and **53/53**
  tests, and ended with all disposable assignments removed.

Exit criteria:

- [x] No uncaught extension-attributable errors.
- [x] No duplicate styles or panels.
- [x] No stale mappings after chat changes.
- [x] No horizontal overflow or unusable controls on responsive or physical
      mobile gates.
- [x] Install and update paths work from the pushed GitHub candidate.

Suggested commit:

```text
fix: harden MVP behavior across desktop and mobile
```

Completion documentation commit:

```text
docs: record Phase 6 installation acceptance
```

### Phase 7 — Documentation and v0.1.0

Status: **In progress — pre-push documentation/browser/mobile acceptance passed; publication and distribution pending**

Tasks:

- [x] Complete the text-only README candidate.
- [x] Complete the text-only Regex setup guide candidate.
- [x] Document direct GitHub installation and installation scope.
- [x] Document update, disable/re-enable, and safe uninstall expectations.
- [x] Document local development setup.
- [x] Document usage with one, multiple, and multiline examples.
- [x] Document Max Depth `50`, Unlimited, older messages, and streaming.
- [x] Document safe failure behavior when Regex is missing or disabled.
- [x] Document current limitations and troubleshooting.
- [x] Set manifest and package versions to `0.1.0` while retaining schema 1.
- [x] Create `CHANGELOG.md` and a matching GitHub Release-note draft.
- [x] Capture and approve authentic dark, light, and narrow/mobile screenshots.
- [x] Add approved screenshots and stable relative README links.
- [x] Correct **Replace With** to authored class `cd-c$1` while documenting
      SillyTavern's automatic rendered `custom-` prefix.
- [x] Complete the README-led Firefox and responsive-layout walkthrough.
- [x] Complete focused physical-Android documentation confirmation.
- [ ] Normally commit and push the accepted candidate.
- [ ] Verify real Extension Manager update and fresh default-branch installation.
- [ ] Create and verify annotated tag `v0.1.0` at the accepted commit.
- [ ] Create the approved GitHub Release page matching the tag and changelog.
- [ ] Verify installation from the exact tag/default branch.
- [ ] Record the completed release and point the roadmap to Phase 8.

Exit criteria:

- A new user can install and configure the extension using only the README.
- The documented behavior matches the shipped behavior.
- Approved authentic dark, light, and mobile screenshots match the final UI.
- All automated, documentation-led browser/mobile, and distribution gates pass.
- Annotated `v0.1.0` and its GitHub Release point to the accepted commit.
- v0.1.0 is installable, usable, and recoverable without manual file editing.

---

## 13. Post-MVP phases

### Phase 8 — Character-card and global defaults

- Store persistent character defaults through character extension fields.
- Store global preferences in extension settings.
- Implement precedence without copying inherited values unnecessarily.
- Handle `characterId === undefined`.
- Define explicit behavior for group chats.
- Show whether each displayed value is inherited or overridden.
- Allow promoting a chat assignment to a character default.
- Allow resetting a chat override to its inherited value.

### Phase 9 — Prompt macro and instruction generator

- Register `{{dialogueColorMap}}` using the current macro API.
- Keep the macro handler synchronous.
- Emit only names, IDs, and `next=cN`; omit hex colors.
- Establish deterministic ID ordering.
- Provide a compact prompt-instruction block.
- Verify behavior in both Chat Completion and Text Completion prompts.
- Measure token overhead.

Example:

```text
c1=Catherine; c2=Daniel; c3=Maria; next=c4
```

### Phase 10 — AI proposal protocol

Candidate marker:

```html
<!-- CD_NEW {"name":"Daniel","id":"c2","color":"#E69F00"} -->
```

Requirements:

- Detect proposals from new raw AI messages.
- Validate JSON without evaluation.
- Reject malformed, duplicate, or out-of-range values.
- Never change permanent mappings automatically.
- Keep pending proposals scoped to the correct chat.
- Define swipe, regeneration, edit, and deletion behavior.
- Present approve, edit, and reject controls.
- Hide or harmlessly normalize the proposal marker in display.
- Resolve how proposal markers are excluded from future outgoing prompts without
  interfering with normal compact dialogue markers.

The outgoing-prompt behavior is an unresolved design item and must be solved
before this phase is implemented.

### Phase 11 — Portability and accessibility tools

- Mapping import/export.
- Versioned export schema.
- Preset color palettes.
- Next visually distinct color.
- Duplicate-color warnings.
- Contrast calculations against common light/dark backgrounds.
- Accessible preview and warnings.
- Restore defaults.

### Phase 12 — Convenience, groups, and localization

- Optional Magic Wand or toolbar shortcut.
- Pending proposal badge.
- Group-chat semantics.
- Localization files.
- Keyboard shortcuts only if they do not conflict with SillyTavern.
- Packaging polish.
- Optional official catalog submission.

---

## 14. Compatibility and risk register

| Risk | Mitigation |
| --- | --- |
| SillyTavern DOM selector changes | Keep selector in one constant and test every supported release |
| `chatMetadata` reference changes | Fetch it from `getContext()` for each operation |
| Chat switches during save | Capture/re-check active chat identity and serialize UI operations |
| Older messages show raw markers | Document Regex Max Depth and offer Unlimited |
| Partial markers during streaming | Accept temporary raw display; test before release |
| Theme overrides text color | Use scoped selector; increase specificity only if required |
| Poor contrast on custom backgrounds | Add contrast tools post-MVP |
| Regex missing or disabled | Show setup guidance; never crash |
| Regex HTML is sanitized differently | Prove behavior in Phase 0 |
| Malformed metadata | Normalize and skip invalid entries |
| Unsafe names/import data | Use text nodes and strict validation |
| Group chat has no single `characterId` | Defer and design explicitly |
| Proposal comments return to AI | Resolve outgoing filtering before Phase 10 |
| GitHub filename case differs from manifest | Test clean Linux/Termux install |
| Extension Manager cannot access repository | Keep repo public and dependency-free |
| Desktop and phone ST versions diverge | Record both versions during release testing |
| Upstream API deprecation | Prefer `SillyTavern.getContext()` and current camel-case APIs |

---

## 15. Testing matrix

### Platforms

- Arch Linux development installation.
- Desktop browser used for development.
- Android phone accessing a Termux-hosted SillyTavern installation.

### Core scenarios

- No active chat.
- Active chat with no mappings.
- One mapping.
- Several mappings.
- Maximum valid ID `c99`.
- Invalid IDs.
- Edit name only.
- Edit color only.
- Change ID.
- Delete mapping.
- Reload page.
- Switch between chats with conflicting use of the same ID.
- Create a new chat.
- Edit a message containing markers.
- Swipe/regenerate a marked response.
- Stream a marked response.
- Missing/disabled Regex.
- Regex Max Depth exceeded.
- Light and dark themes.
- Narrow mobile viewport.

### Release installation scenarios

- Install from the default GitHub branch.
- Disable and re-enable the extension.
- Reload SillyTavern after installation.
- Update after a version bump.
- Fresh install on Termux/Linux with case-sensitive paths.
- Uninstall and reinstall without corrupting chat metadata.

---

## 16. Git workflow

Recommended lightweight workflow:

- `main` always contains the latest working checkpoint.
- Develop one roadmap phase at a time.
- Make small commits with one coherent purpose.
- Push only after the phase's local checks pass.
- Use tags for public versions.
- Do not commit SillyTavern itself into the extension repository.
- Do not commit user data, chats, character cards, settings, secrets, or logs.
- Create a clean ZIP snapshot with `scripts/archive-project.sh` whenever the
  current project state needs to be uploaded for review.

Suggested commit sequence:

```text
docs: define regex display contract
chore: scaffold Chromatic Dialogue extension
feat: add per-chat assignment storage
feat: generate scoped dialogue color styles
feat: add assignment management panel
feat: synchronize assignments on chat change
fix: harden MVP behavior across desktop and mobile
docs: record Phase 6 installation acceptance
docs: prepare v0.1.0 release
```

---

## 17. Definition of done

A phase is done only when:

- All listed tasks are complete or intentionally deferred with a reason.
- Exit criteria are demonstrated.
- Relevant desktop tests pass.
- Relevant phone tests pass at designated mobile checkpoints.
- No new uncaught browser-console errors exist.
- Documentation reflects any design change.
- The Decision Log is updated if architecture changed.
- The Project Status section points to the next phase.
- A focused Git commit records the completed checkpoint.

The project is not complete merely because the UI appears to work once.

---

## 18. Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-07-30 | Target SillyTavern 1.18.0+ | Reference installation is 1.18.0-1-g8172dcd0e |
| 2026-07-30 | Keep Regex, markers, and mapping manager separate | Minimizes CPU use, complexity, and data mutation |
| 2026-07-30 | Use per-chat metadata for the MVP | Proves isolation across unrelated roleplays |
| 2026-07-30 | Use native ES modules without a build step | Simplifies Arch/Neovim development and Termux installation |
| 2026-07-30 | Use Extensions settings panel first | Documented and less fragile than a custom toolbar hook |
| 2026-07-30 | Defer AI proposals | Correct persistence and outgoing-prompt behavior require a proven core |
| 2026-07-30 | Support direct GitHub installation | SillyTavern can clone and load a valid extension repository automatically |
| 2026-07-30 | Build snapshots from Git state | Automatically includes new project files while respecting `.gitignore` and explicit safety exclusions |
| 2026-07-30 | Use `zNe4/SillyTavern-ChromaticDialogue` | The public GitHub project identity has been created |
| 2026-07-30 | Use `zNe4` as the public author and AGPL-3.0 as the license | Resolves the remaining manifest and distribution choices before scaffolding |
| 2026-07-30 | Use all-users placement for desktop development | Matches the official direct-checkout workflow while `global.d.ts` supports both scopes |
| 2026-07-30 | Normalize every metadata read and candidate write through schema version 1 | Keeps malformed data and mutable context references outside the UI contract |
| 2026-07-30 | Re-check chat identity before mutation and after asynchronous persistence | Prevents stale operations from being reported as successful after a chat switch |
| 2026-07-30 | Scope generated rules to `#chat .mes_text .custom-cd-cN` | Matches the verified SillyTavern message body and actual Regex-rendered class contract |
| 2026-07-30 | Register one combined chat refresh listener during extension activation | Restored chat metadata may become available before `APP_INITIALIZED`; early `CHAT_CHANGED` registration applies and clears CSS reliably without polling |
| 2026-07-31 | Track the rendered chat identity per panel and suppress stale operation completions | The existing single `CHAT_CHANGED` listener remains sufficient while form, feedback, rows, and CSS converge safely after rapid switches or pending saves |
| 2026-08-01 | Normalize uppercase assignment input while keeping canonical storage lowercase | `C1` is a tolerant user/read form of `c1`; duplicate detection must run after normalization |
| 2026-08-01 | Preserve long Unicode names without an arbitrary limit | Safe text rendering and responsive wrapping passed automated, Firefox RDM, and physical Android verification |
| 2026-08-01 | Color both marker spans and nested `q` descendants | SillyTavern theme quote rules can override visible nested quote text even when the marker span itself has the correct computed color |
| 2026-08-01 | Use physical Android as a human-only usability gate and defer unavailable Chromium desktop | Phone automation was not required for meaningful touch/layout acceptance, while unavailable browser coverage must not be reported as passed |
| 2026-08-01 | Keep accepted in-panel CRUD feedback and track optional platform toasts as a future enhancement | Adding new notification integration after interaction acceptance is not required to close Phase 6 and should retain the accessible status channel |
| 2026-08-01 | Require both a real Extension Manager fast-forward and a removed/recreated shallow GitHub clone for distribution acceptance | Git hashes, reflogs, exact file manifests, retained metadata, browser behavior, and cleanup distinguish real update/install paths from a manual checkout or file copy |
| 2026-08-01 | Retain SillyTavern 1.18.0+ and recommended Regex Max Depth 50 for v0.1.0 | Both values have accepted evidence; Unlimited remains the documented user choice for formatting the entire visible transcript |
| 2026-08-01 | Align manifest/package at 0.1.0, add a changelog, and publish an annotated tag plus matching GitHub Release only after acceptance | Keeps version surfaces and durable release history coherent without making a binary asset part of normal installation |
| 2026-08-01 | Treat authentic dark, light, and mobile screenshots as a privacy-approved sub-batch and retain the Chromium-unavailable deferral | Screenshots require human selection, while unrun browser coverage must not be reported as passed or block the evidence-backed release |
| 2026-08-01 | Keep v0.1.0 limited to documentation, versioning, and release acceptance | AI proposals, inherited defaults, import/export, toolbar shortcuts, localization, contrast tooling, group semantics, and success toasts remain post-MVP work |
| 2026-08-01 | Distinguish authored Regex class `cd-cN` from rendered DOM class `custom-cd-cN` | SillyTavern adds `custom-` automatically during rendering; users must enter `cd-c$1`, while the extension's existing CSS correctly targets the prefixed rendered class |

---

## 19. Open decisions

Resolve before the indicated milestone:

### Before Phase 1

- [x] Final GitHub username/organization: `zNe4`.
- [x] Final repository name: `SillyTavern-ChromaticDialogue`.
- [x] Manifest author value: `zNe4`.
- [x] License choice: AGPL-3.0.
- [x] Use the all-users extension location for desktop development; retain
      editor type support for both installation scopes.

### Before Phase 3

- [x] Final chat-content CSS selector: `#chat .mes_text`.
      Rendered Regex classes use the verified `custom-cd-cN` contract.

### Before v0.1.0

- [x] Retain Max Depth `50` as the balanced recommendation; Unlimited formats
      the entire visible transcript. This remains a user-managed Regex setting,
      not an extension-enforced mobile default.
- [x] Exact streaming behavior: a compact marker may remain raw/partial while
      streaming and transforms once its complete valid closing tag is present.

- [x] Support and document SillyTavern `1.18.0+`; do not expand the compatibility
      matrix immediately before the first release.
- [x] Publish a concise GitHub Release page in addition to the annotated tag;
      no binary asset is required for normal installation.
- [x] Final concise extension description for README and release notes.
- [x] Final privacy-approved screenshots: Dark Lite desktop edit, Violet Glass
      Light desktop add, and Dark Lite Firefox RDM narrow/mobile layouts.

### Future usability enhancements

- [ ] Consider optional SillyTavern toast notifications after successful add,
      edit, and delete operations while retaining the accepted accessible
      in-panel status message.

### Before AI proposals

- [ ] Pending proposal persistence model.
- [ ] Swipe/regeneration semantics.
- [ ] Safe removal from future outgoing prompts.

---

## 20. Progress log

Add concise entries after meaningful work:

```text
YYYY-MM-DD — Phase N
- Completed:
- Tested:
- Problems found:
- Decisions changed:
- Next:
```

Initial entry:

```text
2026-07-30 — Planning
- Completed: Architecture assessment, MVP boundary, repository plan, and phased roadmap.
- Tested: Nothing yet.
- Problems found: Quote configuration and proposal outgoing filtering require later design.
- Decisions changed: GitHub URL installation is now an explicit MVP acceptance requirement.
- Next: Execute Phase 0 Regex and compatibility spike.
```

```text
2026-07-30 — Phase 0
- Completed: The user confirmed that the built-in Regex works correctly.
- Tested: Regex Test Mode and actual chat rendering.
- Problems found: The production CSS selector still needs confirmation during the skeleton/CSS phase.
- Decisions changed: Added a Git-aware project snapshot script and archive workflow.
- Additional verification: The archive script passed Bash syntax, inclusion/exclusion, ZIP creation, and ZIP integrity tests.
- Next: Create the repository and begin Phase 1.
```

```text
2026-07-30 — Phase 1
- Completed: Created https://github.com/zNe4/SillyTavern-ChromaticDialogue and fixed the repository identity.
- Tested: Public installation has not been tested because the extension skeleton does not exist yet.
- Problems found: The new repository is not indexed by public search yet; this does not block development.
- Decisions changed: Manifest homePage and installation URL are now final.
- Next: Add the Phase 1 skeleton files and make the first project commit.
```

```text
2026-07-30 — Phase 1 skeleton and runtime verification
- Completed: Added the manifest, lifecycle bootstrap, settings template, static styles, editor types, Regex guide, README, archive workflow, and empty-state panel behavior.
- Tested: Static checks, direct installation, full reload, idempotent initialization, active/no-chat panel states, and browser-console behavior.
- Problems found: No Phase 1 blocker remains.
- Decisions changed: Fixed the public author to zNe4, selected AGPL-3.0, and selected the all-users location for desktop development.
- Checkpoint: 7d35ef1 chore: scaffold Chromatic Dialogue extension.
- Next: Implement the version-1 domain model and per-chat storage.
```

```text
2026-07-30 — Phase 2
- Completed: Added schema-versioned normalization, c1-c99 validation, name and color normalization, detached per-chat reads, guarded persistence, and panel integration through readActiveChatState().
- Tested: 20/20 automated tests; syntax and whitespace checks; live save/reload persistence; two-way chat isolation; malformed-metadata fallback and restoration; test-data cleanup.
- Problems found: A chat could change while saveMetadata() was pending; the store now re-checks identity afterward and returns chat-changed instead of reporting a stale success.
- Decisions changed: Reads always obtain fresh SillyTavern context, and saves re-check chat identity both before mutation and after persistence.
- Checkpoint: 6e1621a feat: add per-chat assignment state storage.
- Next: Begin Phase 3 by verifying the real message-content selector in the disposable test chat.
```

```text
2026-07-30 — Phase 3
- Completed: Verified the real message-content and Regex class selectors; added strict deterministic CSS generation, one reusable generated style element, the storage-to-style runtime bridge, and one combined chat refresh path.
- Tested: 28/28 automated tests; selector and theme specificity; immediate color replacement; one-style-element reuse; no-chat clearing; chat switching; reopening a mapped chat; metadata cleanup; and browser reload behavior with no active chat.
- Problems found: APP_INITIALIZED can occur after the startup CHAT_CHANGED event, so registering the chat listener during initialization missed restored chat metadata.
- Decisions changed: Register the existing CHAT_CHANGED listener during extension activation and use it to refresh both generated CSS and panel state.
- Additional verification: No message content was modified; no polling, MutationObserver, background interval, animation loop, or continuous DOM scan was introduced; no new red browser-console errors appeared.
- Checkpoint: c43821b feat: add dynamic dialogue CSS manager.
- Next: Create and push the Phase 3 implementation commit, record its checkpoint, then begin Phase 4 manual assignment CRUD.
```

```text
2026-07-31 — Phase 4 partial checkpoint
- Completed: Added read-only assignment rendering, the assignment form, picker and hex synchronization, live preview, validation, duplicate rejection, no-chat disabling, safe text rendering, responsive layout, add persistence, and edit selection/form population.
- Tested: 33/33 automated tests; live assignment rendering, form states, color synchronization, preview behavior, validation, add persistence and reload, numeric ordering, generated CSS updates, edit selection, fresh-state rereading, mobile layout, cleanup, and browser-console behavior.
- Problems found: No blocker remains for the completed scope. Edit persistence and deletion are not yet implemented.
- Decisions changed: Create and push a verified partial Phase 4 checkpoint before changing the development workflow.
- Additional verification: No polling, MutationObserver, background interval, animation loop, continuous DOM scan, message traversal, or message-content rewrite was introduced.
- Next: Commit and push this checkpoint, then continue Phase 4 with edit persistence and deletion under the revised workflow.
```

```text
2026-07-31 — Phase 4 completion
- Completed: Added immutable-ID edit persistence, explicit cancellation, confirmed deletion, same-chat and same-assignment revalidation, pending-operation control locking, immediate panel/CSS refresh, empty-state cleanup, and safe persistence rollback.
- Tested: 48/48 automated tests; focused storage/edit/delete regression; add, edit, reload persistence, confirmed delete, and delete-after-reload in Firefox; disposable-ID cleanup; preservation of pre-existing assignments; and cleanup of an interrupted test run in its originating chat.
- Problems found: SillyTavern does not reopen the last active chat after restart, so the live harness correctly reported a transient wrong-chat failure until the originating chat was reopened. The installed extension's independent Git HEAD did not describe its synchronized runtime, so live synchronization validation now compares exact file contents and hashes instead.
- Decisions changed: Assignment IDs remain immutable during edit; deletion always requires confirmation and revalidates both chat identity and the confirmed assignment snapshot; all assignment actions lock while persistence is pending; roadmap completion requires both automated and live-browser evidence.
- Additional verification: No polling, MutationObserver, background interval, animation loop, continuous DOM scan, message traversal, or message-content rewrite was introduced. All disposable c99 data was removed and the original c1 test mapping remained unchanged.
- Next: Commit and push the verified Phase 4 completion, then begin Phase 5 chat-change synchronization.
```

```text
2026-07-31 — Phase 5
- Completed: Hardened the existing single CHAT_CHANGED path with panel-scoped rendered-chat identity, complete stale form/preview/feedback invalidation, and suppression of stale pending add/edit/delete completion UI.
- Tested: 49/49 automated tests; focused 16/16 lifecycle and add/edit/delete synchronization tests; exact live runtime synchronization; desktop A → B → A isolation; seven recorded rapid switches; same-ID edit invalidation; blank-chat and no-chat states; reload recovery; Firefox Responsive Design Mode at 390 × 844; and no new extension-attributable console errors.
- Problems found: An operator attempted to arm the desktop edit-switch check after already switching chats; the harness stopped safely, preserved progress, and the corrected sequence passed. No product failure remained.
- Decisions changed: Preserve the existing one-time CHAT_CHANGED listener and guarded save path; use panel-scoped rendered identity to prevent stale UI completions from crossing chat boundaries.
- Additional verification: Chat A and Chat B metadata were restored exactly to their read-only snapshots; no polling, observer, animation loop, continuous DOM scan, message traversal, message rewrite, or direct metadata write was introduced.
- Next: Commit and push the verified Phase 5 completion, then begin Phase 6 MVP hardening and mobile verification.
```

```text
2026-08-01 — Phase 6 pre-push acceptance
- Completed: Hardened boundary/input behavior, long-name mobile layout, accessibility markup, logging discipline, and generated colors for marker spans plus nested quote elements; synchronized the reviewed runtime to desktop and Termux installations.
- Tested: 53/53 automated tests and 20/20 syntax checks; Firefox 153 desktop with NanoGPT streaming, swipe, regeneration, edits, reload, keyboard, six themes, and console review; 390 × 844 and 360 × 780 Firefox RDM; Samsung Note 20 Ultra portrait usability in Opera 100.2.5122.89341 against Termux; exact desktop-chat cleanup.
- Problems found: SillyTavern theme quote rules overrode visible nested quote text; the focused selector fix passed 9/9 focused tests and live Dark Lite/Violet Glass Light checks. The physical-phone operator requested optional full SillyTavern success notifications; accepted in-panel feedback remains functional and the toast enhancement is recorded for later. Chromium desktop was unavailable and is explicitly deferred.
- Decisions changed: Uppercase IDs normalize to lowercase canonical storage; long Unicode names remain unbounded; generated rules cover nested q elements; phone acceptance remains human-only; optional platform toasts must supplement accessible in-panel feedback.
- Next: Apply this evidence documentation, perform the pre-push review, normally commit and push the Phase 6 candidate, then run disposable public-Phase-5 update and fresh-main installation acceptance before declaring Phase 6 complete.
```

```text
2026-08-01 — Phase 6 completion
- Completed: Normally published the reviewed hardening implementation at 1d6864c0f35f9809cbf124f3deea0dbcc26a4d73; updated a disposable global installation from public Phase 5 through SillyTavern's real Extension Manager; removed it; and installed a new global depth-1 clone from the public GitHub URL.
- Tested: Existing c1 metadata compatibility, panel and manifest loading, basic CRUD, reload persistence, exactly one generated style element, zero attributable console errors, cleanup, 31/31 project-file identity, 20/20 syntax checks, and 53/53 tests for both the updated and fresh installations.
- Problems found: The first update capture used PASS for three measured observation fields that required exact values 1, 0, and YES. Correcting only those evidence values made the retry pass; no product, update, or test failure occurred. Chromium desktop remains explicitly deferred because it is unavailable.
- Decisions changed: Phase 6 distribution acceptance requires both the real Phase 5-to-Phase 6 git-pull transition and a newly cloned shallow main installation; the manifest remained at its aligned pre-release version until Phase 7.
- Checkpoint: 1d6864c fix: harden MVP behavior across desktop and mobile.
- Next: Commit and push this Phase 6 completion record, verify clean local/remote equality, then begin Phase 7 documentation and v0.1.0 release preparation.
```

```text
2026-08-01 — Phase 7 Stage A text/version candidate
- Completed: Audited the exact Phase 6 tree; expanded first-time installation, usage, update/uninstall, Max Depth, failure, limitation, troubleshooting, and local-development documentation; aligned manifest/package at 0.1.0; created CHANGELOG.md and a matching GitHub Release-note draft; resolved the compatibility, depth, release-page, browser, and v0.1.0 scope decisions.
- Tested: Outer and nested archive safety and checksums; exact 31-file Phase 6 reconstruction; public main/commit/tree/parent and absent v0.1.0 tag; exact six-file candidate whitelist; whitespace and local Markdown links; version/schema/manifest invariants; 20/20 syntax checks; and 53/53 automated tests before and after the text/version changes.
- Problems found: The prior README lacked release-ready update/uninstall, examples, troubleshooting, Max Depth, missing-Regex, limitation, screenshot, and complete local-development guidance. The roadmap still pointed to the already completed Phase 6 documentation commit and retained three now-resolved pre-release decisions.
- Decisions changed: Accepted the Phase 7 handoff defaults unchanged. Authentic screenshots remain a separate privacy-approved sub-batch, and no runtime/schema/Regex-protocol change belongs in the text candidate.
- Next: Review, verify, and apply the exact text/version candidate; then capture and approve the three authentic screenshots before documentation-led browser/mobile and distribution acceptance.
```

```text
2026-08-01 — Phase 7 screenshot asset candidate
- Completed: Approved three authentic privacy-safe captures for Dark Lite desktop edit, Violet Glass Light desktop add, and Dark Lite Firefox RDM 390 × 844 portrait; added the exact PNGs under docs/images with descriptive stable README links.
- Tested: Returned-report ZIP safety, integrity, and PASS marker; byte-for-byte attachment/package identity; PNG dimensions, structure, and absence of private metadata; original-resolution visual privacy, authenticity, theme, viewport, readability, and crop review; unchanged runtime boundary; Markdown links; version/schema invariants; syntax checks; and the full automated suite.
- Problems found: The light capture contains a faint non-private theme/background mark and the narrow capture retains a tiny lower viewport edge; neither obscures content, exposes private data, or misrepresents the extension, so both were approved without image editing.
- Decisions changed: Final screenshots are now fixed to the three reviewed PNG hashes; preserve the authentic pixels and do not retouch or synthesize release documentation captures.
- Next: Review and apply the screenshot asset sub-batch, then complete the README-led Firefox/responsive walkthrough and focused physical-Android documentation confirmation before distribution and release gates.
```

```text
2026-08-01 — Phase 7 Regex replacement correction candidate
- Completed: Corrected the user-authored Regex replacement from custom-cd-c$1 to cd-c$1 in the setup guide and roadmap; clarified the same two-stage transformation in README and troubleshooting text.
- Tested: Exact three-document change boundary; authored cd-cN versus automatically prefixed rendered custom-cd-cN consistency; unchanged runtime selector and schema; local Markdown links; version invariants; syntax checks; and the full automated suite.
- Problems found: The candidate incorrectly told users to include SillyTavern's automatic custom- prefix in Replace With, despite the accepted runtime correctly targeting the final rendered custom-cd-cN class.
- Decisions changed: Treat cd-cN as the authored Regex class and custom-cd-cN as the post-render DOM contract. Runtime CSS remains unchanged.
- Next: Review and apply this corrective sub-batch, then restart documentation-led Firefox/RDM and focused physical-Android acceptance from the corrected candidate.
```

```text
2026-08-01 — Phase 7 documentation-led pre-push acceptance
- Completed: Used the exact staged README and linked Regex guide as the operative instructions; reviewed installation/update/disable/uninstall/local-development prose; completed the Firefox real-chat workflow, both responsive gates, and focused physical-Android confirmation; and removed all disposable data while restoring original Regex settings.
- Tested: Firefox 153.0 with SillyTavern 1.18.0-1-g8172dcd0e; authored cd-cN versus automatically rendered custom-cd-cN; exact Regex settings and single/multiple/multiline Test Mode; Quick start, raw storage, outgoing-off behavior, marker contract, CRUD/reuse/status, reload and cross-chat scope, Max Depth/Unlimited, final streaming state, disabled-Regex safe failure/recovery, troubleshooting, Dark Lite/Violet Glass Light nested quote color, three README screenshots, zero new attributable uncaught console errors, Firefox RDM at 390 × 844 and 360 × 780, and Samsung Note 20 Ultra portrait usability in Opera 100.2.5122.89341 against Termux.
- Problems found: No documentation or product failure remained. Physical Android evidence remains an intentional human-usability confirmation; actual default-branch update/fresh-install verification remains pending until after push, and unavailable Chromium desktop remains explicitly deferred.
- Decisions changed: The corrected authored cd-cN / rendered custom-cd-cN distinction is now documentation-led and live-accepted; no runtime, schema, test, dependency, or screenshot change is needed.
- Cleanup: Disposable assignments/messages were removed, original Regex enabled/depth settings were restored, unrelated data was preserved, and the exact nine staged paths plus all 35 project hashes remained unchanged at HEAD/origin-main a330b70d06aae18c3031573a87e9b0a1e8e05c95.
- Next: Apply this evidence record, normally commit and push the accepted Phase 7 candidate, then verify a real Extension Manager update and fresh default-branch installation before tagging and release.
```
