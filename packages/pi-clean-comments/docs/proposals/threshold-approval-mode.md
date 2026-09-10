# Proposal: threshold-approval mode

## Problem

Today's `tool_result` hook only nudges after a comment has already been
written — it can't stop a long comment from landing in the file at all.
There's no way to make "comments over N lines require approval" actually
true; it relies on the agent choosing to comply.

## Idea

Gate comment length at the point of writing, not after. Configure a
threshold (default: 2 lines). Any added comment block at or under the
threshold is written as normal (optionally still nudged, as today). Any
block over the threshold pauses the tool call for approval before it's
allowed to land.

## Mechanism (sketch)

- Hook `tool_call` (fires before execution, can mutate input, can
  `{ block: true }`) instead of only `tool_result`.
- For `write`, scan the full proposed `content` directly.
- For `edit`, reconstruct the proposed post-edit content from
  `{ path, edits: [{ oldText, newText }] }` and diff against the
  current on-disk file to find added lines — same detection primitives
  the package already has, run one step earlier.
- If the longest added block exceeds the threshold, prompt with
  `ctx.ui.confirm()`, quoting the comment back. Decline → `{ block: true,
reason }`; the file is never written.

## Constraint: needs a UI to ask

`ctx.ui.confirm()` requires `ctx.hasUI`, which is `false` in print mode,
JSON mode, and inside subagents (pi's `subagent` tool spawns children with
`--mode json -p`). There is no one to click "approve" in those contexts.

When no UI is available, this mode can't do a live approval — it needs a
fallback behavior instead. The candidate fallback is to strip and record
the over-threshold comment the same way [defer mode](./defer-review-mode.md)
does, so the two modes share one underlying mechanism and differ mainly in
"ask now if possible, otherwise queue."

## Open questions to scope

- Where does the threshold (and per-severity overrides?) live —
  project config file, user-level default, both?
- Exact wording/UX of the confirm prompt, and whether a decline offers
  "edit it down" inline vs. just blocking.
- Should the existing severity-scaled nudge (single/short/long) still fire
  for anything under the threshold, or does this mode replace it entirely?
- Non-UI fallback: auto-defer (see other proposal) vs. a stricter
  auto-reject-with-reason vs. configurable per-context behavior.
- Interaction with parallel tool execution (`tool_call` preflights
  sequentially even in parallel mode, so confirms shouldn't race — worth
  confirming against real behavior).
