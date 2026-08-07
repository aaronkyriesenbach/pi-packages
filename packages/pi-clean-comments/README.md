# pi-clean-comments

A [pi](https://pi.dev) extension that nudges the agent to reconsider every
comment it adds or edits, favoring deletion unless a comment earns its
place.

## Why

Coding agents tend to over-comment: narrating obvious lines, restating a
function name in prose, or leaving comments that don't survive the code
they described being refactored. This extension adds a lightweight,
structural check (no NLP, no allowlist) that fires whenever an Edit or
Write tool call touches at least one comment line, appending a note that
quotes back each added comment's file:line and text and reminds the agent
to keep only comments that explain a non-obvious why or gotcha —
everything else should be deleted or cut to the minimum.

The note is wrapped in a `<comment-check required severity="...">` block
and quotes the exact lines added rather than just a count — a generic "N
touched" tally is easy to skim past after the tenth occurrence, but the
agent's own words quoted back at it are harder to wave off.

Contiguous added comment lines are grouped into one block, and both the
wording and the tag's `severity` attribute scale with block length:

| Block length | Severity | Framing                                                           |
| ------------ | -------- | ----------------------------------------------------------------- |
| 1 line       | `single` | Light sanity check — does this line earn its place?               |
| 2–4 lines    | `short`  | Justify why it isn't one line, or delete it.                      |
| 5+ lines     | `long`   | Almost never required — justify every line or cut it to ≤2 lines. |

A 10-line comment block gets a noticeably harsher note than a single
trailing one-liner, since it's the case most likely to be narration
instead of a genuine why/gotcha.

## Install

```bash
pi install npm:@aaronkyriesenbach/pi-clean-comments
```

Or add it to `.pi/settings.json` / `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:@aaronkyriesenbach/pi-clean-comments"]
}
```

## Development

```bash
bun install
bun run typecheck
bun run lint
bun run format:check
bun run test:coverage
```

## License

MIT
