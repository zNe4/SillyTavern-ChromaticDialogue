# Built-in Regex setup

Chromatic Dialogue manages per-chat marker assignments and colors.
SillyTavern's built-in Regex extension remains responsible for transforming
compact markers into display-only HTML.

This setup deliberately leaves stored messages and outgoing prompts unchanged.

## Create the Global script

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

## Verify in Test Mode

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

## Verify in a real chat

1. Open a disposable chat.
2. In **Extensions -> Chromatic Dialogue**, add `c1` with a visible test color.
3. Confirm the Global Regex script is enabled.
4. Produce or edit an AI response containing a complete lowercase
   `[c1]...[/c]` marker.
5. Confirm the rendered dialogue uses the selected color.
6. Confirm the stored/raw message still contains the compact marker and that
   **Alter Outgoing Prompt** remains disabled.
7. Remove the disposable assignment and message when finished.

## Marker contract

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

## Max Depth

Use Min Depth `0` and Max Depth `50` as the balanced recommendation. Messages
older than Max Depth may show raw markers because the display Regex is not
applied to them.

Choose **Unlimited** when you want the entire visible transcript transformed.
This is a user-controlled Regex setting; Chromatic Dialogue does not enforce a
different mobile default.

## Streaming and quote rendering

During streaming, an incomplete marker may remain temporarily visible until
its closing `[/c]` arrives. A complete valid marker then transforms normally.

The replacement supplies fixed curly quotation marks. SillyTavern may render
recognized quotation marks as a nested `<q>` element. Chromatic Dialogue's
generated rules color both the marker span and nested `<q>` elements, so the
selected color remains visible across the verified themes. Version `0.1.0`
does not provide configurable quote glyphs.

## Missing or disabled Regex

If this script is missing, disabled, misconfigured, or outside Max Depth,
Chromatic Dialogue continues to load safely. Assignments remain available, but
the chat displays raw compact markers. The extension must not crash, rewrite
the stored message, or alter the outgoing prompt.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Raw markers in every message | Confirm the script is Global, enabled, affects **AI Response**, and has **Alter Chat Display** enabled. |
| Raw markers only in older messages | Increase Max Depth or choose **Unlimited**. |
| Uppercase marker remains raw | Use lowercase `[c1]...[/c]`; uppercase normalization applies only to the assignment form. |
| Some text remains raw while streaming | Wait for the complete closing `[/c]`. |
| Narration gains quotation marks | Keep narration outside `[cN]...[/c]`. |
| Nested dialogue renders incorrectly | Remove nesting; nested markers are unsupported. |
| Marker transforms but has no expected color | Confirm that the active chat has the matching `cN` assignment, **Replace With** uses `cd-c$1`, and SillyTavern renders the class as `custom-cd-cN`. |
| Prompts are unexpectedly transformed | Disable **Alter Outgoing Prompt** immediately and restore the required settings above. |

Return to the [main README](../README.md) for installation, assignment
management, and general troubleshooting.
