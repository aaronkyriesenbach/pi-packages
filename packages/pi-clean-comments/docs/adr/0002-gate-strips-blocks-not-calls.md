# Gate mode strips offending comment blocks, not whole tool calls

Gate mode needs to turn "comments over N lines require approval" into
something actually enforced, not just nudged at. The obvious primitive is
`tool_call`'s `{ block: true, reason }` — reject the entire `write`/`edit`
call and make the agent resubmit it. We rejected that: a real edit
commonly bundles a code change with the comment explaining it, and a
whole-call rejection punishes the code change for the comment riding
along with it, forcing the agent to reconstruct and resubmit content that
was already fine. Instead, gate mutates `event.input` in place to drop
just the over-threshold comment lines and lets the now-comment-free call
proceed untouched — `tool_call` mutations apply with no re-validation, so
this is a supported primitive, not a workaround.

We also considered a hard-block enforcement tier, wholly separate from
gate, that would reject rather than strip. We rejected the separate tier:
"gate with bypass requests disabled" already behaves identically to a
hard block (strip happens, nothing can ever add the comment back), so a
third named mode would only duplicate behavior gate already produces as
a natural consequence of one of its config values being off.

Because the strip is a pure, stateless mutation — nothing about a
stripped block is recorded anywhere — a bypass request
(`request_comment_exception`) can't reference a stripped block by id.
It mirrors the built-in `edit` tool's own input shape
(`{ path, edits: [{ oldText, newText }], reason }`) instead, and the
agent resupplies the exact comment text itself. This piggybacks on
`edit`'s existing anchor-matching for free: if the surrounding code
drifted between the strip and the bypass request being resolved, `oldText`
simply fails to match, the same way a stale `edit` call already fails
today, with no new staleness-detection logic required.

## Consequences

- Gate mode never fully rejects a `write`/`edit` call; only the
  offending comment lines are removed, so unrelated code changes in the
  same call always land.
- There is no server-side record of what a strip removed. If the agent
  wants a stripped comment reinstated, it must remember and resupply the
  exact text itself via `request_comment_exception` — the extension
  keeps no memory of stripped content between the strip and that call.
- A bypass request is only ever an `edit`-shaped operation. It can't
  introduce a stripped comment at a location the original `write`/`edit`
  didn't already touch, since it's anchored the same way `edit` is.
