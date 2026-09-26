# Built-in Regex setup

Chromatic Dialogue manages per-chat marker assignments and colors.
SillyTavern's built-in Regex extension is used for two separate, independent
responsibilities:

1. **Dialogue display script** (Chat Display only)
   Transforms compact markers such as `[c1]...[/c]` into colored HTML spans
   for the user interface.
2. **Control-record prompt-hygiene script** (Outgoing Prompt only)
   Strips one-line `<!-- CD_NEW ... -->` registration comments from outgoing
   LLM prompts so internal control metadata does not leak back into model context.

These two scripts are deliberately separate. Do not combine them, and do not
enable **Alter Outgoing Prompt** on the display script.

For AI-managed speaker registration, these Regex scripts are paired with the
[recommended AI prompt](ai-prompt.md). The AI prompt is separate from Regex: it
tells the model how to reuse committed IDs and when to append `CD_NEW` records.

Neither script mutates stored chat messages. The stored chat remains
byte-for-byte unchanged. Compact `[cN]...[/c]` dialogue markers remain present
in both stored messages and outgoing LLM prompt history. Only `CD_NEW` control
records are absent from outgoing prompts.

---

## Overview of Regex responsibilities

| Script | Purpose | Scope | Affects | Alter Chat Display | Alter Outgoing Prompt | Replace With |
| --- | --- | --- | --- | --- | --- | --- |
| **Dialogue Display** | `[cN]...[/c]` → styled `<span>` | Global | AI Response (2) | **Enabled** | **Disabled** | `<span class="cd-c$1">“$2”</span>` |
| **Prompt Hygiene** | Remove `<!-- CD_NEW ... -->` | Global | AI Response (2) | **Disabled** | **Enabled** | *(empty)* |

---

## Script 1: Dialogue display script

Open SillyTavern's built-in **Regex** extension, create a **Global** script, and
enter the following values exactly.

### Find Regex

```regex
/\[c([1-9]\d?)\]([\s\S]*?)\[\/c\]/g
```

### Replace With

```html
<span class="cd-c$1">“$2”</span>
```

SillyTavern automatically adds the `custom-` prefix when it renders this class
in chat. Configure `cd-c$1` here; the resulting rendered class is
`custom-cd-cN`, which is what Chromatic Dialogue colors. Do not add the prefix
manually in **Replace With**.

### Required settings

| Setting | Value |
| --- | --- |
| Script scope | Global |
| Affects | AI Response |
| Run on Edit | Enabled |
| Macros in Find Regex | Don't Substitute |
| Alter Chat Display | Enabled |
| Alter Outgoing Prompt | Disabled |
| Disabled | Off |
| Min Depth | `0` |
| Recommended Max Depth | `50` |

Also leave SillyTavern's **Show `<tags>` in responses** setting unchecked.

### Verify in Test Mode

Start with one complete marker:

```text
[c1]Good morning.[/c]
```

The replacement result should be:

```html
<span class="cd-c1">“Good morning.”</span>
```

In the rendered chat, SillyTavern exposes that class as `custom-cd-c1` after
adding its automatic prefix.

Then test multiple and multiline dialogue:

```text
[c1]First speaker.[/c]

Narration remains outside the markers.

[c2]Second speaker,
continuing on another line.[/c]
```

Both complete dialogue segments should be transformed independently. The
narration should remain unchanged.

Test Mode proves the expression and replacement, but it does not prove the
complete chat workflow. Continue with a disposable real chat.

### Verify in a real chat

1. Open a disposable chat.
2. In **Extensions -> Chromatic Dialogue**, add `c1` with a visible test color.
3. Confirm the Global Regex script is enabled.
4. Produce or edit an AI response containing a complete lowercase
   `[c1]...[/c]` marker.
5. Confirm the rendered dialogue uses the selected color.
6. Confirm the stored/raw message still contains the compact marker and that
   **Alter Outgoing Prompt** remains disabled.
7. Remove the disposable assignment and message when finished.

### Marker contract

- Valid marker IDs are lowercase `c1` through `c99`.
- The assignment form accepts uppercase input such as `C1` and stores `c1`, but
  this Regex is case-sensitive: `[C1]...[/c]` does not match.
- Multiple markers and multiline dialogue are supported.
- Nested markers are invalid.
- Narration and actions should remain outside markers.
- An opening marker without `[/c]` remains raw.
- Raw `[cN]...[/c]` markers remain in the stored chat.
- The outgoing prompt is not altered.
- Only the rendered chat receives the `<span>`.

Invalid examples:

```text
[c0]Out of range.[/c]
[c01]Leading zero.[/c]
[c100]Out of range.[/c]
[C1]Uppercase marker.[/c]
[c1]Missing closing marker.
```

### Max Depth

Use Min Depth `0` and Max Depth `50` as the balanced recommendation. Messages
older than Max Depth may show raw markers because the display Regex is not
applied to them.

Choose **Unlimited** when you want the entire visible transcript transformed.
This is a user-controlled Regex setting; Chromatic Dialogue does not enforce a
different mobile default.

### Streaming and quote rendering

During streaming, an incomplete marker may remain temporarily visible until
its closing `[/c]` arrives. A complete valid marker then transforms normally.

The replacement supplies fixed curly quotation marks. SillyTavern may render
recognized quotation marks as a nested `<q>` element. Chromatic Dialogue's
generated rules color both the marker span and nested `<q>` elements, so the
selected color remains visible across the verified themes. Version `0.1.0`
does not provide configurable quote glyphs.

---

## Script 2: Control-record prompt-hygiene script

When an assistant response introduces a new speaker, Chromatic Dialogue permits
the model to append an internal registration comment:

```text
[c2]Hello.[/c]

<!-- CD_NEW {"id":"c2","name":"Mara","color":"#B86FD4"} -->
```

- **Stored chat**: Preserves the `<!-- CD_NEW ... -->` line verbatim. Chromatic
  Dialogue can inspect it when the message is received, and the raw record
  remains in chat history after a page reload. Current pending Review state is
  memory-only and is not reconstructed automatically after reload.
- **Rendered chat**: SillyTavern/browser HTML rendering hides HTML comments
  automatically.
- **Outgoing prompt**: This Regex removes the `<!-- CD_NEW ... -->` line when
  constructing subsequent LLM prompts, keeping prompts clean without re-feeding
  historical control records to the model.

### Import from JSON (Recommended)

1. Open SillyTavern's **Regex** extension panel.
2. Click **Import** (or the folder icon).
3. Select `docs/regex-control-records.json`.
4. Ensure the imported script is enabled.

### Manual Configuration

If creating manually, create a **Global** Regex script with:

#### Script Name
```text
Chromatic Dialogue - Hide control records from prompt
```

#### Find Regex
```regex
/^[ \t]*<!--[ \t]*CD_NEW\b[^\r\n]*-->[ \t]*(?:\r?\n)?/gm
```

#### Replace With
*(Leave completely empty)*

#### Required Settings

| Setting | Value |
| --- | --- |
| Script scope | Global |
| Affects | AI Response (Placement: `2`) |
| Alter Chat Display | **Disabled** (`markdownOnly: false`) |
| Alter Outgoing Prompt | **Enabled** (`promptOnly: true`) |
| Disabled | **Off** (`disabled: false`) |
| Macros in Find Regex | Don't Substitute (`substituteRegex: 0`) |
| Min Depth | Unlimited (`null`) |
| Max Depth | Unlimited (`null`) |
| Run on Edit | Disabled (`false`) |

Use **Unlimited** depth so historical messages never leak old `CD_NEW` control
records back into LLM context.

### Prompt hygiene behavior and guarantees

- **Stored chat is never mutated**: SillyTavern applies prompt-only regex
  in-memory when assembling outgoing prompt arrays. The stored message file
  remains byte-for-byte intact.
- **`[cN]` markers remain in outgoing history**: Dialogue markers like
  `[c1]...[/c]` are not touched by this script and remain available to the model.
- **`CD_NEW` records are removed from outgoing history**: The control comment
  line is omitted from subsequent prompts.
- **Non-destructive & safe**: Disabling this cleanup script does not corrupt
  Chromatic Dialogue or chat storage; it only means raw `CD_NEW` comments may
  reach the LLM in future turns.
- **No irreversible regex mutation**: No "Run on Edit" chat-modifying script is
  used.
- **Malformed control lines**: Any single-line comment beginning with
  `<!-- CD_NEW` is stripped from outgoing prompts even if its JSON payload is
  invalid, preventing malformed control lines from becoming durable model
  context.
- **Unrelated prose and comments preserved**: Prose mentioning `CD_NEW` outside
  a comment, or comments that do not begin with `CD_NEW`, are preserved.
- **Line-scoped**: The expression never spans multiple lines and will not
  consume preceding or following dialogue lines.

---

## Missing or disabled Regex

If either script is missing, disabled, misconfigured, or outside Max Depth,
Chromatic Dialogue continues to load safely:
- If Script 1 (Display) is missing/disabled: Compact markers like `[c1]...[/c]`
  remain visible as raw text, but assignments remain intact and no crash occurs.
- If Script 2 (Prompt Hygiene) is missing/disabled: Historical `<!-- CD_NEW ... -->`
  lines remain in outgoing prompts sent to the LLM, but Chromatic Dialogue
  runtime operation remains functional.

Neither script will ever corrupt or rewrite the stored chat transcript.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Raw markers in every message | Confirm Script 1 is Global, enabled, affects **AI Response**, and has **Alter Chat Display** enabled. |
| Raw markers only in older messages | Increase Max Depth or choose **Unlimited** on Script 1. |
| Uppercase marker remains raw | Use lowercase `[c1]...[/c]`; uppercase normalization applies only to the assignment form. |
| Some text remains raw while streaming | Wait for the complete closing `[/c]`. |
| Narration gains quotation marks | Keep narration outside `[cN]...[/c]`. |
| Nested dialogue renders incorrectly | Remove nesting; nested markers are unsupported. |
| Marker transforms but has no expected color | Confirm that the active chat has the matching `cN` assignment, Script 1 **Replace With** uses `cd-c$1`, and SillyTavern renders the class as `custom-cd-cN`. |
| Prompts are unexpectedly transformed | Ensure Script 1 has **Alter Outgoing Prompt** disabled. |
| `<!-- CD_NEW ... -->` appears in outgoing prompts | Confirm Script 2 is enabled, has **Alter Outgoing Prompt** enabled, and depth is set to **Unlimited**. |
| Dialogue missing from prompts | Verify Script 2 **Find Regex** matches `CD_NEW` comments only and does not match dialogue markers. |

Return to the [main README](../README.md) for installation, assignment
management, and general troubleshooting.
