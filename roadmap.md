# Chromatic Dialogue roadmap

## Current state

Chromatic Dialogue `1.0.1` is the current stable release. The `1.0.0` release remains the first stable release, and `1.0.1` adds a focused compatibility fix for presets that append auxiliary/non-story content after Chromatic Dialogue registration records.

The functional architecture through Automatic mode is complete and has been validated by the automated suite and in real SillyTavern roleplay flows, including cross-theme, constrained-width, Review, Automatic, multi-character registration, prompt-hygiene, and auxiliary-tail compatibility testing.

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
- Auxiliary-tail tolerant registration: one contiguous `CD_NEW` block may be followed by arbitrary third-party auxiliary content without format-specific parsing, while fragmented registration blocks remain rejected.
- Optional per-utterance dialogue tones with a closed `whisper` / `shout` / `measured` / `tremble` vocabulary, tone-aware registration validation, unified display Regex rendering, and typography-only presentation that preserves character color.

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
- A separate freeform thought/emotion grammar. B2 adds only a small closed set of optional vocal-delivery tones inside the existing dialogue marker; speaker identity remains the `cN` assignment.

## Post-1.0 development series

The immediate post-1.0 sequence is:

1. **B1 — Auxiliary-tail tolerant registration** — complete in `1.0.1`.
2. **B2 — Optional dialogue tones** — implementation and automated integration are complete in the current development branch. Tone remains per utterance and does not change assignment identity or persisted schema. Live SillyTavern validation and the `1.1.0` release gate remain before B2 is considered released.
3. **B3 — Legacy chat migration** — planned after B2 is released. Migration must be explicit, previewed, user-confirmed, and non-automatic.

Other possible future work includes:

- Optional assignment import/export.
- Optional richer diagnostics for rejected AI proposal packets.
- Updated current-version screenshots when useful.
- Additional accessibility/localization work.
- Broader browser/device verification.

Any future feature must preserve the current safety boundaries: raw messages are not rewritten by normal Chromatic Dialogue runtime behavior, unresolved Review cards remain session-only, committed registry state remains chat-scoped, and Automatic mode must continue to reuse the safe approval/persistence path rather than bypass it.
