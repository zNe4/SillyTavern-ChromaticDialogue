# Chromatic Dialogue roadmap

## Current state

Chromatic Dialogue `1.0.0` is the first stable release line. The functional architecture through Automatic mode is complete and has been validated by the automated suite and in real SillyTavern roleplay flows, including cross-theme and constrained-width testing.

Completed functional phases:

- Chat-scoped registry and CRUD.
- Generated dialogue-color CSS.
- Prompt macros and compact registry state.
- `CD_NEW` proposal parsing and state-aware validation.
- Automatic contrast correction for AI-proposed colors.
- Message inspection and memory-only pending Review store.
- Snapshot-safe manual Approve/Dismiss workflow.
- Reactive Review UI.
- Native SillyTavern Regex prompt hygiene.
- Strict-write metadata hardening.
- Per-chat Off / Review / Automatic operation modes.
- Serialized Automatic approval using the same safe Review persistence path.
- First-success-wins conflict behavior and already-applied reconciliation.

The historical development plan and acceptance notes that led to this architecture are preserved in [docs/development-history.md](docs/development-history.md).

## 1.0.0 release finalization

The `1.0.0` release build is considered publishable only when all items in [docs/release-checklist.md](docs/release-checklist.md) pass.

A17 remains deliberately non-feature work:

1. Keep README, prompt, Regex, and changelog documentation aligned with the shipped behavior.
2. Keep package/manifest version metadata aligned.
3. Verify all local documentation links and required release files.
4. Run the full automated suite and syntax/JSON checks from a clean candidate archive.
5. Perform one final real SillyTavern smoke test of Off, Review, Automatic, manual CRUD, chat switching, and prompt hygiene.

## Deliberately not planned for 1.0.0

- Persistence/reconstruction of unresolved Review cards. Only committed characters should become durable state.
- Global or inherited character/color defaults across chats.
- Import/export UI for assignments.
- Localization framework.
- Dedicated group-chat semantics beyond the existing chat-scoped registry behavior.
- A second thought/tone formatting grammar. The supported AI protocol intentionally stays focused on speaker identity and spoken dialogue.

## Possible post-1.0.0 work

Future work should be driven by real usage rather than added pre-release complexity. Candidates include:

- Optional assignment import/export.
- Optional richer diagnostics for rejected AI proposal packets.
- Updated current-version screenshots after the first release UI is frozen.
- Additional accessibility/localization work.
- Broader browser/device verification.

Any future feature must preserve the current safety boundaries: raw messages are not rewritten by Chromatic Dialogue, committed registry state remains chat-scoped, and Automatic mode must continue to reuse the safe approval/persistence path rather than bypass it.
