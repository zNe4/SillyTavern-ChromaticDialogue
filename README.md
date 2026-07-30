# Chromatic Dialogue

Chromatic Dialogue is a chat-scoped dialogue color manager for
[SillyTavern](https://github.com/SillyTavern/SillyTavern).

It is designed to associate compact dialogue markers such as
`[c1]...[/c]` with configurable colors while leaving SillyTavern's stored
messages and outgoing prompts unchanged.

> [!IMPORTANT]
> Chromatic Dialogue is currently in early development. Phase 1 provides the
> extension scaffold, settings panel, lifecycle handling, and active-chat
> detection. Assignment management, persistence, dynamic styles, and proposal
> detection are not implemented yet.

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

## Current Phase 1 behavior

The current scaffold:

* Loads through SillyTavern's extension lifecycle.
* Mounts its settings panel only once.
* Registers lifecycle listeners only once.
* Shows a no-chat state when no chat is active.
* Shows an empty-assignment state when a chat is active.
* Remains independent of build tools and runtime dependencies.

## Development

Chromatic Dialogue uses native JavaScript ES modules, HTML, and CSS. It has no
build step and no third-party runtime dependencies.

Run the automated tests with:

```bash
npm test
```

The test suite currently verifies lifecycle registration, concurrent-safe
initialization, idempotent panel mounting, and active-chat state changes.

## Project structure

```text
.
├── docs/
│   └── regex-setup.md
├── src/
│   ├── constants.js
│   └── panel.js
├── tests/
│   └── index.test.mjs
├── global.d.ts
├── index.js
├── manifest.json
├── package.json
├── settings.html
└── style.css
```

## License

Chromatic Dialogue is licensed under the
[GNU Affero General Public License v3.0](LICENSE).

