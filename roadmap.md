# Chromatic Dialogue — Project Roadmap

> Living source of truth for the design, implementation, testing, and release of
> the Chromatic Dialogue SillyTavern UI extension.

## Project status

- Current phase: **Phase 1 — Loadable extension skeleton**
- Target SillyTavern version: **1.18.0+**
- Reference installation: **1.18.0-1-g8172dcd0e**
- First release target: **v0.1.0**
- Implementation status: **Regex validated; GitHub repository created; no extension code written**
- Repository: **https://github.com/zNe4/SillyTavern-ChromaticDialogue**
- Next action: Populate the repository with the Phase 1 skeleton.

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

SillyTavern's built-in Regex extension displays:
<span class="cd-c1">“Dialogue”</span>

Chromatic Dialogue stores:
c1 = Catherine = #56B4E9

Chromatic Dialogue generates:
.cd-c1 { color: #56B4E9; }
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
├── src/
│   ├── constants.js
│   ├── domain.js
│   ├── chat-store.js
│   ├── style-manager.js
│   └── panel.js
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
| `src/constants.js` | Metadata key, DOM IDs, selector, and limits |
| `src/domain.js` | Schema, validation, normalization, and pure transformations |
| `src/chat-store.js` | Current-chat metadata reads and writes |
| `src/style-manager.js` | Dedicated generated-style lifecycle |
| `src/panel.js` | UI rendering, form handling, and user feedback |
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
- GitHub Releases are optional but useful for changelogs; they are not required
  for installation.

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
10. Show a success or failure notification.

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
#chat .mes_text .cd-c1 {
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
- Confirm `.mes_text` or the actual message-content selector during Phase 3.
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

Tasks:

- [x] Create the Git repository.
- [x] Select the final GitHub repository name.
- [ ] Add license.
- [ ] Create valid `manifest.json`.
- [ ] Create `index.js`, `settings.html`, and `style.css`.
- [ ] Add `global.d.ts` for Neovim LSP support.
- [ ] Add and validate `scripts/archive-project.sh`.
- [ ] Register an idempotent initialization path.
- [ ] Render an empty Chromatic Dialogue settings panel.
- [ ] Show no-chat and no-assignment states.
- [ ] Confirm no console errors.
- [ ] Push the repository to GitHub.
- [ ] Install a clean copy using the Extension Manager and repository URL.

Exit criteria:

- Extension loads on desktop from a direct development checkout.
- Extension installs and loads from its GitHub URL.
- Reloading the page does not duplicate the panel.
- No runtime error appears in the browser console.

Suggested commit:

```text
chore: scaffold Chromatic Dialogue extension
```

### Phase 2 — Domain model and chat storage

Tasks:

- [ ] Define schema version 1.
- [ ] Implement pure ID validation.
- [ ] Implement name normalization.
- [ ] Implement hex validation and normalization.
- [ ] Implement safe state normalization.
- [ ] Read metadata from the active chat on demand.
- [ ] Save metadata with `saveMetadata()`.
- [ ] Avoid retaining the `chatMetadata` reference.
- [ ] Handle no active chat.
- [ ] Handle missing metadata.
- [ ] Handle partially malformed metadata.
- [ ] Protect against a chat switch during an edit/save operation.

Exit criteria:

- A valid mapping survives browser reload.
- The mapping exists only in its original chat.
- Malformed metadata cannot crash initialization.
- Invalid values are never persisted by the UI.

Suggested commit:

```text
feat: add per-chat assignment storage
```

### Phase 3 — Dynamic CSS manager

Tasks:

- [ ] Create or reuse the dedicated style element.
- [ ] Generate scoped rules from normalized mappings.
- [ ] Replace existing generated CSS atomically.
- [ ] Clear rules for empty/no-chat state.
- [ ] Reject unvalidated IDs and colors.
- [ ] Test theme specificity.
- [ ] Verify that style updates require no message DOM traversal.

Exit criteria:

- Changing a saved color immediately changes rendered dialogue.
- Exactly one generated style element exists.
- Switching to an empty chat removes previous-chat colors.
- The extension changes CSS only, not message content.

Suggested commit:

```text
feat: generate scoped dialogue color styles
```

### Phase 4 — Manual assignment CRUD

Tasks:

- [ ] Render current assignments.
- [ ] Add assignment form.
- [ ] Synchronize hex field and color picker.
- [ ] Add live preview.
- [ ] Implement add.
- [ ] Implement edit.
- [ ] Implement delete.
- [ ] Reject duplicate IDs.
- [ ] Provide clear validation feedback.
- [ ] Disable editing without an active chat.
- [ ] Ensure names are rendered as text.
- [ ] Build responsive mobile layout.

Exit criteria:

- All assignment management is possible without DevTools or manual JSON edits.
- Failed validation never alters the existing mapping.
- Successful operations persist and update CSS immediately.
- The interface remains usable on a phone.

Suggested commit:

```text
feat: add assignment management panel
```

### Phase 5 — Chat-change synchronization

Tasks:

- [ ] Listen for `eventTypes.CHAT_CHANGED`.
- [ ] Invalidate open edit state on chat switch.
- [ ] Load the new chat's mappings.
- [ ] Rerender the table.
- [ ] Replace generated CSS.
- [ ] Test rapid repeated switching.
- [ ] Test new-chat creation.
- [ ] Test no-character/no-chat state.

Required scenario:

```text
Chat A: c1 = Catherine = #56B4E9
Chat B: c1 = Daniel    = #E69F00
```

Exit criteria:

- Table and colors always match the active chat.
- No assignment leaks between chats.
- No stale save writes to the wrong chat.
- Switching does not duplicate event listeners or UI.

Suggested commit:

```text
feat: synchronize assignments on chat change
```

### Phase 6 — MVP hardening and mobile verification

Tasks:

- [ ] Test IDs `c1`, `c9`, `c10`, and `c99`.
- [ ] Reject `c0`, `c01`, `c100`, uppercase IDs, and arbitrary classes.
- [ ] Test empty, whitespace-only, Unicode, and long names.
- [ ] Test lowercase and uppercase hex input.
- [ ] Test deletion and re-adding the same ID.
- [ ] Test message edits.
- [ ] Test swipes and regeneration.
- [ ] Test streaming.
- [ ] Test page reload.
- [ ] Test multiple themes.
- [ ] Test Firefox/Chromium on desktop when available.
- [ ] Test the Termux-hosted installation on a phone.
- [ ] Test GitHub installation.
- [ ] Test Extension Manager update from an earlier manifest version.
- [ ] Review console logging and remove debug noise.
- [ ] Review accessibility labels and keyboard navigation.

Exit criteria:

- No uncaught errors.
- No duplicate styles or panels.
- No stale mappings after chat changes.
- No horizontal overflow or unusable controls on mobile.
- Install and update paths work from GitHub.

Suggested commit:

```text
fix: harden MVP behavior across desktop and mobile
```

### Phase 7 — Documentation and v0.1.0

Tasks:

- [ ] Complete README.
- [ ] Complete Regex setup guide.
- [ ] Document direct GitHub installation.
- [ ] Document local development setup.
- [ ] Document usage with examples.
- [ ] Document Max Depth behavior.
- [ ] Document failure behavior when Regex is missing.
- [ ] Document current limitations.
- [ ] Add screenshots after UI stabilizes.
- [ ] Set manifest version to `0.1.0`.
- [ ] Create `CHANGELOG.md` if release notes warrant it.
- [ ] Tag `v0.1.0`.
- [ ] Verify a fresh installation from the tag/default branch.

Exit criteria:

- A new user can install and configure the extension using only the README.
- The documented behavior matches the shipped behavior.
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

---

## 19. Open decisions

Resolve before the indicated milestone:

### Before Phase 1

- [x] Final GitHub username/organization: `zNe4`.
- [x] Final repository name: `SillyTavern-ChromaticDialogue`.
- [ ] Confirm manifest author value; planned value is `zNe4`.
- [ ] License choice. AGPL-3.0 is the default recommendation if unsure.
- [ ] Confirm whether desktop development uses the user-scoped or all-users
      extension location.

### Before Phase 3

- [ ] Final chat-content CSS selector.

### Before v0.1.0

- [ ] Whether Max Depth `50` is the best mobile default.
- [ ] Exact streaming behavior.

- [ ] Whether to support only `1.18.0+` or test older releases.
- [ ] Whether a GitHub Release page is useful in addition to the Git tag.
- [ ] Final screenshots and extension description.

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
