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
reminds the agent to keep only comments that explain a non-obvious why or
gotcha — everything else should be deleted or cut to the minimum.

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
