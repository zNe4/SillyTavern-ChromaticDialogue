# AI prompt setup

Chromatic Dialogue does not inject roleplay formatting instructions into the model by itself. It registers four SillyTavern prompt macros and validates registration records that appear in assistant messages. To make the workflow reliable, add a small formatting protocol to a prompt field where SillyTavern expands custom macros.

The recommended prompt below is intentionally simple. It keeps the useful parts of older HTML/color prompts—strict dialogue-only formatting and explicit color selection—while adding a small closed set of optional per-utterance delivery tones. Character identity remains the `cN` ID; tone never becomes persisted character state.

## Recommended prompt

Copy this block into the prompt context you use for roleplay formatting:

```text
<chromatic_dialogue>
Current registry: {{cdState}}

Format spoken character dialogue with Chromatic Dialogue markers.

Rules:
- Spoken dialogue only: wrap ordinary spoken words as [cN]Dialogue[/c].
- Optional dialogue tones are available only when the vocal delivery is meaningfully exceptional: [cN:whisper]Dialogue[/c], [cN:shout]Dialogue[/c], [cN:measured]Dialogue[/c], or [cN:tremble]Dialogue[/c].
- Tones are optional. Ordinary or normal speech should omit a tone and use [cN]Dialogue[/c].
- Tone applies to one utterance only; it is delivery metadata, not character or speaker identity.
- The supported tone vocabulary is closed: whisper, shout, measured, tremble. Do not invent freeform tones or aliases; ordinary speech uses the untoned marker rather than a special normal-tone alias.
- Do not put quotation marks inside Chromatic Dialogue markers; the display Regex adds them.
- Keep narration, actions, attribution, prose, sound effects, and unspoken thoughts outside the markers and untagged.
- Do not use HTML <font> tags or named-color tags.

Existing speakers:
- Reuse the exact cN ID already associated with that character in the registry roster.
- Never emit CD_NEW for a character already present in the roster.

New speakers:
- Register only a genuinely new, distinct speaking character that is not already in the roster.
- Use the first unused ID(s) in ascending numeric order, starting with next= from the registry.
- If several new characters first speak in the same response, give them successive free IDs in ascending order.
- Choose one valid six-digit #RRGGBB color for each new character. Prefer a vivid hue that is visually distinct from other new characters in the same response. Chromatic Dialogue may adjust the stored color to meet contrast requirements.
- Use each new ID in that character's visible dialogue before registering it.

After all visible story text, emit exactly one standalone one-line registration record for each new character, keeping all records together as one contiguous registration block:
<!-- CD_NEW {"id":"cN","name":"Character Name","color":"#RRGGBB"} -->

Registration block:
- must come after all visible story text;
- if other instructions produce auxiliary or non-story content, must appear immediately before any auxiliary or non-story content;
- must contain exactly id, name, and color in each record;
- must use unique IDs and unique character names within the response;
- must be ordered by ascending assigned ID;
- no narration or spoken dialogue may resume after the registration block;
- auxiliary or non-story content may follow when required by other instructions; Chromatic Dialogue does not prescribe its format.

If next=none, do not invent another ID and do not emit CD_NEW for a new speaker.
</chromatic_dialogue>
```

## Prompt-manager integration

The recommended block can be stored inside a prompt-manager variable or switch as long as that manager reevaluates the assignment on every generation.

The critical part is keeping `{{cdState}}` inside the per-generation assignment. That makes the next generation see the latest committed registry after Review approvals, Automatic registrations, deletes, or ID reuse.

Use normal Enter-created line breaks. Do not replace them with literal `\n` characters unless a specific manager explicitly documents escape decoding.

A Nemo Engine-style pattern has been live-tested successfully:

```text
{{setvar::UtilityDirective_ColorFormatting::- <chromatic_dialogue>
Current registry: {{cdState}}

...the rest of the Chromatic Dialogue directive...
</chromatic_dialogue>}}
{{trim}}
```

In that workflow, the variable initializer runs first and clears `UtilityDirective_ColorFormatting`, the enabled coloring switch overwrites it with the current directive, and the later assembler reads that variable. Disabling the switch therefore leaves the variable empty for that generation instead of reusing stale Chromatic Dialogue instructions.

For any other prompt manager, verify the same two behaviors:

1. the directive is reevaluated each generation, so `{{cdState}}` changes immediately when the committed registry changes;
2. disabling the module removes the directive rather than reusing the previous generation's stored value.

## Why this prompt is structured this way

Older color-formatting prompts often asked the model to remember a color forever or to emit HTML such as `<font color="#HEX">`. Chromatic Dialogue no longer needs that. The extension stores committed ID/name/color assignments per chat, and `{{cdState}}` tells the model which IDs belong to existing characters.

Chromatic Dialogue supports a deliberately small optional delivery-tone grammar inside the same marker that already identifies the speaker. The supported forms are `[cN:whisper]`, `[cN:shout]`, `[cN:measured]`, and `[cN:tremble]`. These describe how one utterance is delivered; they do not change the character assignment, persist a default tone, or create a second identity dimension. Keeping the vocabulary closed also reduces prompt complexity for smaller or older models.

Ordinary speech should remain `[cN]Dialogue[/c]`; do not tone-tag every line. Unsupported/freeform tone names and a special normal-tone alias are intentionally not part of the protocol.

The prompt also tells the model not to include quotation marks inside ordinary or toned Chromatic Dialogue markers because the recommended display Regex supplies the curly quotation marks when rendering the chat.

## Macro reference

Chromatic Dialogue registers these macros:

| Macro | Example | Purpose |
| --- | --- | --- |
| `{{cdCount}}` | `5` | Number of committed assignments in the active chat. |
| `{{cdNext}}` | `c6` | First currently unused assignment ID, or `none`. |
| `{{cdRoster}}` | `c1=Catherine; c3=Maria` | Existing committed ID/name pairs. |
| `{{cdState}}` | `count=2; roster=c1=Catherine,c3=Maria; next=c2` | Compact all-in-one state recommended for the prompt. |

The macros describe **committed assignments only**. Pending Review cards do not reserve IDs and do not advance `next`.

## Examples

### Existing speaker

If the registry contains `c2=Mara`, the model should reuse `c2` and emit no registration record:

```text
Mara glances toward the door.

[c2]We should leave before they notice us.[/c]
```

### Existing speaker with an optional delivery tone

Use a tone only when the vocal delivery itself matters:

```text
[c2:whisper]Someone is outside the door.[/c]

[c2:measured]Then we wait until they make the first move.[/c]
```

Ordinary lines from the same speaker should still use `[c2]...[/c]`. Tone never changes the committed `c2` assignment.

### One new speaker

If `next=c6` and The Archivist is not in the roster:

```text
A woman in a dust-covered coat steps out from behind the shelves.

[c6]You were not supposed to find this room.[/c]

<!-- CD_NEW {"id":"c6","name":"The Archivist","color":"#56B4E9"} -->
```

### Several new speakers in one response

If the free IDs begin at `c6`, use separate sequential IDs and keep the proposals atomic in one source message:

```text
[c6]Nobody moves until I say so.[/c]

A second guard lowers his voice.

[c7]This is getting out of hand.[/c]

<!-- CD_NEW {"id":"c6","name":"Captain Vey","color":"#E69F00"} -->
<!-- CD_NEW {"id":"c7","name":"Guard Nilo","color":"#009E73"} -->
```

Chromatic Dialogue reviews or registers those proposals as one atomic group for that assistant message.

### Invalid: two characters claiming the same ID in one message

This is rejected as a malformed proposal packet:

```text
[c6]I am the rightful owner of this slot![/c]

<!-- CD_NEW {"id":"c6","name":"The Claimant","color":"#FF5733"} -->
<!-- CD_NEW {"id":"c6","name":"The Usurper","color":"#33FF57"} -->
```

Each new character in one response needs its own free ID. Competing proposals that happen in separate messages are handled safely by the Review/Automatic workflow; the first successfully committed assignment becomes authoritative.

## Color selection and contrast

The model supplies a proposed `#RRGGBB` color only when a character is first registered. Chromatic Dialogue measures that color against the current chat background and adjusts it when necessary to meet the minimum contrast target used by the runtime.

This means the prompt should prioritize a recognizable hue rather than trying to calculate contrast itself. A useful seed palette is:

```text
#56B4E9  #E69F00  #009E73  #CC79A7  #D55E00
#F0E442  #B39DDB  #80CBC4  #FFAB91  #B0BEC5
```

The palette is optional. Duplicate colors are not a registration error, and the model cannot see colors already stored in the roster macro, so global color uniqueness should not be treated as a hard prompt requirement. You can always edit a committed color manually from the extension panel.

## Operation modes

The AI formatting prompt is the same in all three modes. The selected mode only changes how Chromatic Dialogue handles valid new-character proposals after the assistant message arrives:

- **Off** — ignores new registration proposals. Existing assignments and marker colors continue to work.
- **Review** — creates a pending card that you approve or dismiss manually.
- **Automatic** — stores the proposal as pending first, then attempts the same safe approval path automatically. If automatic approval becomes unsafe or uncertain, the pending card remains available for manual handling.

Mode changes apply to future received messages and do not require a reload.

## Pending reviews are intentionally temporary

Pending Review cards are session memory, not durable character data. Reloading the page or restarting SillyTavern does not reconstruct unresolved cards.

This is deliberate: only accepted/committed characters are durable. The raw assistant message still contains the `CD_NEW` record, so if an unresolved card is lost you can copy its ID, name, and color into the manual assignment form.

The prompt-hygiene Regex removes `CD_NEW` lines only from subsequent outgoing LLM prompts; it does not erase them from stored chat messages.

## Troubleshooting prompt behavior

| Symptom | What to change in the prompt/model output |
| --- | --- |
| Double quotation marks | Do not put quotes inside ordinary or toned Chromatic Dialogue markers; the display Regex adds them. |
| Narration is colored | Keep narration/actions outside the markers. |
| Existing character gets a new ID | Make sure `{{cdState}}` is present in a macro-expanding prompt field and tell the model to reuse roster IDs. |
| New proposal is rejected with an unexpected ID | New IDs must use the first free IDs in ascending order; pending cards do not reserve an ID. |
| Two new characters in one response are rejected | Give each one a different free ID and a different name, and place one `CD_NEW` line per character at the end. |
| Registration comments appear in later model context | Import and enable the prompt-hygiene Regex from `docs/regex-control-records.json`. |
| Model invents `<font>` or named-color tags | Keep the explicit rule forbidding legacy HTML/named-color formatting. |
| Model invents unsupported tones or tone-tags every line | Keep the vocabulary closed to `whisper`, `shout`, `measured`, and `tremble`; ordinary speech should stay untoned. |
