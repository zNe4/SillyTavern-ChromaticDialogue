# Built-in Regex setup

Chromatic Dialogue manages marker assignments and colors. SillyTavern's
built-in Regex extension remains responsible for turning compact dialogue
markers into display-only HTML.

## Create the global script

Open SillyTavern's built-in **Regex** extension, create a **Global** script, and
use these values.

### Find Regex

```regex
/\[c([1-9]\d?)\]([\s\S]*?)\[\/c\]/g
```

### Replace With

```html
<span class="cd-c$1">“$2”</span>
```

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

## Verify the script

Use Regex Test Mode with:

```text
[c1]Good morning.[/c]
```

The displayed result should be:

```html
<span class="cd-c1">“Good morning.”</span>
```

Then verify an actual AI chat message before relying on the setup.

## Expected behavior

- Raw `[cN]...[/c]` markers remain in the stored chat.
- The outgoing prompt is not altered.
- Only the rendered chat receives the `<span>`.
- IDs from `c1` through `c99` are supported.
- Multiple markers and multiline dialogue are supported.
- Nested markers are invalid.
- Narration and actions should remain outside dialogue markers.

Messages older than **Max Depth** may show raw markers. Choose **Unlimited** if
you want the entire visible transcript transformed. During streaming, a marker
may remain temporarily visible until its closing `[/c]` arrives.

If the Regex script is missing or disabled, Chromatic Dialogue must continue to
load safely; the compact markers will simply remain visible.
