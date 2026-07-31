# Chromatic Dialogue

Chromatic Dialogue is a chat-scoped dialogue color manager for
[SillyTavern](https://github.com/SillyTavern/SillyTavern).

It is designed to associate compact dialogue markers such as
`[c1]...[/c]` with configurable colors while leaving SillyTavern's stored
messages and outgoing prompts unchanged.

> [!IMPORTANT]
> Chromatic Dialogue is currently in early development. Phases 1 through 5
> provide per-chat storage, dynamic dialogue styles, and complete manual
> assignment management with chat-change synchronization. AI proposals,
> inherited defaults, import/export, and release hardening are not implemented
> yet.

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
* Adds, edits, and deletes assignments through the Extensions panel.
* Keeps assignment IDs immutable while editing.
* Requires confirmation before deletion.
* Validates names, IDs, and six-digit hexadecimal colors before persistence.
* Regenerates scoped dialogue CSS immediately after successful changes.
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
4. Select **Add assignment**.
5. Use **Edit** to change the name or color without changing the marker ID.
6. Use **Delete** and confirm the prompt to remove an assignment.

Successful changes are saved to the active chat and update generated dialogue
styles immediately.

## Development

Chromatic Dialogue uses native JavaScript ES modules, HTML, and CSS. It has no
build step and no third-party runtime dependencies.

Run the automated tests with:

```bash
npm test
```

The 49-test suite currently verifies domain normalization, guarded per-chat
persistence, generated CSS, lifecycle behavior, assignment rendering,
validation, add/edit/delete operations, pending-save locking, rapid chat-switch
isolation, stale form and completion invalidation, blank/no-chat states,
persistence rollback, and ID reuse after deletion.

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
