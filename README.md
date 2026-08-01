# Chromatic Dialogue

Chromatic Dialogue is a chat-scoped dialogue color manager for
[SillyTavern](https://github.com/SillyTavern/SillyTavern).

It is designed to associate compact dialogue markers such as
`[c1]...[/c]` with configurable colors while leaving SillyTavern's stored
messages and outgoing prompts unchanged.

> [!IMPORTANT]
> Chromatic Dialogue is currently in early development. Phases 1 through 5 are
> complete, and the Phase 6 candidate has passed its automated, Firefox,
> responsive-layout, and physical-Android pre-push gates. GitHub update and
> fresh-install acceptance remain pending until that candidate is published.
> AI proposals, inherited defaults, import/export, and release hardening are
> not implemented yet.

## Intended workflow

1. Chromatic Dialogue stores color assignments for the active chat.
2. Dialogue uses compact markers such as `[c1]Hello.[/c]`.
3. SillyTavern's built-in Regex extension transforms those markers into
   display-only `<span>` elements.
4. Chromatic Dialogue supplies the corresponding CSS colors.

The raw markers remain in chat storage, and the outgoing prompt is not altered.

## Requirements

* SillyTavern `1.18.0` or newer.
* SillyTavern's built-in Regex extension.
* A Regex script configured according to
  [docs/regex-setup.md](docs/regex-setup.md).

## Installation

Once a release is available:

1. Open SillyTavern.

2. Open the **Extensions** panel.

3. Select **Install Extension**.

4. Enter:

   ```text
   https://github.com/zNe4/SillyTavern-ChromaticDialogue
   ```

5. Complete the installation and reload SillyTavern.

## Current behavior

The current implementation:

* Loads through SillyTavern's extension lifecycle.
* Mounts its settings panel only once.
* Registers lifecycle listeners only once.
* Shows a no-chat state when no chat is active.
* Shows an empty-assignment state when a chat is active.
* Stores independent `c1` through `c99` assignments in each chat's metadata.
* Accepts uppercase or surrounding whitespace in assignment-ID input and stores
  the canonical lowercase ID, so `C1` becomes `c1`.
* Adds, edits, and deletes assignments through the Extensions panel.
* Keeps assignment IDs immutable while editing.
* Requires confirmation before deletion.
* Validates names, IDs, and six-digit hexadecimal colors before persistence.
* Preserves Unicode names without an arbitrary length limit after trimming
  leading and trailing whitespace.
* Normalizes accepted hexadecimal colors to uppercase.
* Regenerates scoped dialogue CSS immediately after successful changes.
* Applies each selected color to both the Regex marker span and any nested
  `<q>` element inserted by SillyTavern's quote rendering.
* Restores saved mappings after reload.
* Synchronizes the assignment table and generated CSS with every active-chat
  change, including rapid repeated switching.
* Clears stale edit identity, form values, preview, and feedback when the active
  chat changes, even when both chats contain the same assignment ID.
* Prevents pending add, edit, or delete completion UI from repainting results
  from a previously active chat.
* Leaves stored messages and outgoing prompts unchanged.
* Performs no polling, message-DOM scanning, or background observation.
* Remains independent of build tools and runtime dependencies.

## Managing assignments

1. Open a chat.
2. Open **Extensions → Chromatic Dialogue**.
3. Enter an unused ID from `c1` through `c99`, a character name, and a color.
   Uppercase ID input is accepted and normalized to lowercase.
4. Select **Add assignment**.
5. Use **Edit** to change the name or color without changing the marker ID.
6. Use **Delete** and confirm the prompt to remove an assignment.

Successful changes are saved to the active chat, update generated dialogue
styles immediately, and produce an accessible status message inside the
extension panel. Optional SillyTavern toast notifications for successful add,
edit, and delete operations are tracked as a future usability enhancement.

## Phase 6 compatibility verification

The current pre-push candidate has been verified with:

* **53/53 automated tests** and syntax checks for all 20 JavaScript/MJS files.
* **Firefox 153.0 on Linux/X11**, including NanoGPT streaming with a
  decentralized Llama 3.1 8B model, message edits, swipes, regeneration,
  reload, keyboard-only operation, and console review.
* Themes **Azure**, **Dark Lite**, **Celestial Macaron**, **Cappuccino**,
  **Moonlit Echoes**, and **Violet Glass Light**.
* Firefox Responsive Design Mode at **390 × 844** and **360 × 780** CSS pixels.
* A physical **Samsung Note 20 Ultra** in portrait orientation using
  **Opera 100.2.5122.89341** against a separate Termux-hosted SillyTavern
  installation.

Chromium desktop verification is explicitly deferred because Chromium is not
available in the current test environment. Phase 6 is not complete until the
published candidate also passes disposable Extension Manager update and fresh
GitHub installation tests.

## Development

Chromatic Dialogue uses native JavaScript ES modules, HTML, and CSS. It has no
build step and no third-party runtime dependencies.

Run the automated tests with:

```bash
npm test
```

The 53-test suite currently verifies domain normalization, guarded per-chat
persistence, generated CSS, lifecycle behavior, assignment rendering,
validation, boundary and invalid IDs, uppercase-ID and hexadecimal-color
normalization, Unicode and long names, accessibility markup, nested quote
coloring, add/edit/delete operations, pending-save locking, rapid chat-switch
isolation, stale form and completion invalidation, blank/no-chat states,
persistence rollback, reload reconstruction, and ID reuse after deletion.

## Project structure

```text
.
├── docs/
│   └── regex-setup.md
├── src/
│   ├── constants.js
│   ├── domain.js
│   ├── chat-store.js
│   ├── style-manager.js
│   ├── style-runtime.js
│   └── panel.js
├── tests/
│   └── *.test.mjs
├── scripts/
│   └── archive-project.sh
├── global.d.ts
├── index.js
├── manifest.json
├── package.json
├── roadmap.md
├── settings.html
└── style.css
```

## License

Chromatic Dialogue is licensed under the
[GNU Affero General Public License v3.0](LICENSE).
