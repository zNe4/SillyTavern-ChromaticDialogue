# Changelog

All notable changes to Chromatic Dialogue are documented here.

## [1.1.0] - 2026-09-26

Minor release adding optional per-utterance vocal-delivery tones while preserving the existing character-color and registration architecture.

### Added

- Optional dialogue-tone syntax for the closed `whisper`, `shout`, `measured`, and `tremble` vocabulary.
- Tone-aware registration validation, so a genuinely new speaker may be introduced with a supported toned marker such as `[c3:whisper]...[/c]` without requiring a separate untoned `[c3]` occurrence.
- Importable unified dialogue-display Regex asset at `docs/regex-dialogue-display.json`, covering both ordinary `[cN]...[/c]` and supported `[cN:tone]...[/c]` markers.
- Typography-only tone presentation classes for Whisper, Shout, Measured, and Tremble.
- Runtime and approval regression coverage proving toned first utterances work through Review, Automatic, and fresh approval/revalidation paths.

### Changed

- The recommended AI prompt now documents tones as optional vocal-delivery modifiers and tells models to leave ordinary speech untoned.
- The Regex setup guide now documents the unified display asset and the separation between character-color classes and tone-presentation classes.

### Compatibility and safety

- Existing `[cN]...[/c]` dialogue remains fully supported and unchanged.
- Tone is per utterance only; it is not part of character identity, `CD_NEW`, assignment metadata, or the persisted schema.
- Unsupported or freeform tone tokens remain raw instead of silently falling back to ordinary dialogue rendering.
- Tone CSS does not override character color, reduce opacity, or add persistent animation/jitter effects.
- The `1.0.1` auxiliary-tail compatibility behavior remains unchanged.

## [1.0.1] - 2026-09-26

Compatibility patch for SillyTavern presets that append auxiliary or non-story content after the visible roleplay response.

### Fixed

- `CD_NEW` registrations no longer need to be the absolute final content of an assistant message.
- One contiguous registration block is accepted with arbitrary auxiliary HTML, Markdown, tracker, note, or other non-story content after it.
- Matching `[cN]` usage may occur anywhere in the source message.
- Fragmented or multiple registration blocks remain rejected, preserving the existing atomic registration safety model.
- Prompt-hygiene continues removing standalone `CD_NEW` control lines regardless of position while preserving surrounding content and stored raw messages.

### Changed

- The recommended AI directive now places the contiguous `CD_NEW` block after visible story text and before any auxiliary/non-story content produced by other instructions.

## [1.0.0] - 2026-09-26

First stable public release. This release promotes the complete, live-validated A0–A17 feature set that was developed on `main` during the pre-release cycle.

### Added

- Per-chat dialogue assignments for canonical IDs `c1` through `c99`.
- Manual Add, Edit, Delete, and ID reuse from the SillyTavern Extensions panel.
- Generated per-chat CSS targeting rendered `custom-cd-cN` dialogue classes.
- Prompt macros:
  - `{{cdCount}}`
  - `{{cdNext}}`
  - `{{cdRoster}}`
  - `{{cdState}}`
- AI registration protocol using trailing one-line `<!-- CD_NEW {...} -->` records.
- Safe parser and state-aware proposal validator with duplicate, capacity, existing-ID/name, marker-use, and first-free-ID checks.
- Automatic WCAG-style color contrast correction for AI-proposed colors against the live chat background.
- Memory-only pending Review store with reactive UI notifications.
- Snapshot-safe Review approval and dismissal flows.
- Atomic approval for multiple new characters proposed by one assistant message.
- Native SillyTavern Regex prompt-hygiene configuration that strips historical `CD_NEW` control records from outgoing prompts without rewriting stored messages.
- Per-chat operation modes:
  - **Off**
  - **Review** (default)
  - **Automatic**
- Serialized Automatic approval controller that stores a normal pending review first and then reuses the same safe Review approval/persistence path.
- First-success-wins handling for competing proposals and already-applied reconciliation for equivalent duplicates.
- Strict-write metadata hardening with rollback on persistence failure and tolerant read behavior for older/malformed stored data.
- Responsive/accessible Review and mode controls.
- Cross-theme runtime background resolution for opaque and semi-transparent SillyTavern theme surfaces, including theme-tint fallback and modern CSS color parsing.
- Release screenshots covering Review progression, committed assignments, final RP rendering, and narrow light/dark layouts.
- Comprehensive automated coverage for registry, macros, parsing, validation, contrast, persistence, Review, Automatic queue/races, panel integration, Regex prompt hygiene, and release contracts.

### Changed

- Chromatic Dialogue is no longer assignment-only: AI-managed registration is a supported workflow.
- Internal `CD_NEW` comments remain in stored raw messages but are removed from later outgoing LLM prompts when the supplied prompt-hygiene Regex is enabled.
- AI-proposed colors are treated as proposals; the committed value may be adjusted to meet the minimum contrast ratio.
- Operation mode is stored independently from assignment registry metadata so a chat can still be switched Off even if assignment metadata is malformed.
- Documentation now recommends a compact `[cN]...[/c]` + `CD_NEW` prompt protocol instead of HTML `<font>` or named-color/tone grammars.
- Prompt-manager guidance now documents per-generation `{{cdState}}` evaluation and the live-tested Nemo Engine variable/switch pattern.
- Review and committed-assignment rows now use responsive two-row layouts at constrained widths so long contrast metadata cannot crush character names.

### Safety and lifecycle guarantees

- Chromatic Dialogue does not rewrite raw assistant messages.
- Pending Review cards do not reserve assignment IDs.
- Pending Review cards are intentionally session-only and are not reconstructed after reload/restart.
- Only successful committed assignments become durable chat metadata.
- Automatic mode never bypasses the approval/registration service; unsafe or stale work is not forced.
- Conflicting proposals cannot overwrite a previously committed assignment through the Automatic queue.
- Mode changes affect future received messages; queued Automatic jobs re-check current mode/chat before beginning approval.

### Setup

- Requires the display Regex described in `docs/regex-setup.md`.
- AI workflows also require the prompt-hygiene Regex (`docs/regex-control-records.json`) and the recommended AI prompt (`docs/ai-prompt.md`).
