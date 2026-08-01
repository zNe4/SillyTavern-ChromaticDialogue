# Changelog

This file records user-visible changes to Chromatic Dialogue. Internal test
diaries and unreleased design proposals are intentionally omitted.

## 0.1.0

First public MVP release.

### Added

- Chat-scoped `c1` through `c99` dialogue color assignments stored in
  SillyTavern chat metadata under schema version 1.
- Responsive Extensions-panel controls for adding, editing, deleting, and
  reusing assignments.
- Canonical lowercase assignment IDs, trimmed Unicode names, and normalized
  six-digit hexadecimal colors.
- Immediate, deterministic CSS generation for Regex marker spans and nested
  quote elements.
- Active-chat synchronization, reload reconstruction, guarded persistence,
  delete confirmation, and accessible in-panel status messages.
- Direct GitHub installation, local-development, usage, Regex setup,
  troubleshooting, and compatibility documentation.

### Compatibility and behavior

- Supports SillyTavern `1.18.0+` and requires its built-in Regex extension for
  display transformation.
- Uses recommended Regex depth `0` through `50`; Unlimited formats the entire
  visible transcript.
- Keeps compact markers in stored messages and leaves outgoing prompts
  unchanged.
- Performs no polling, message scanning, message rewriting, streaming
  interception, runtime dependency loading, or build step.

### Known limitations

- Marker syntax is lowercase and does not support nesting.
- The supplied Regex uses fixed curly quotation marks.
- Missing or disabled Regex displays raw markers without breaking assignment
  storage.
- Character/global defaults, AI proposals, import/export, palette and contrast
  tools, toolbar shortcuts, localization, and special group semantics are not
  included.
- Chromium desktop remains unverified because it was unavailable during the
  MVP acceptance campaign; Firefox desktop/responsive layouts and physical
  Android were verified.
