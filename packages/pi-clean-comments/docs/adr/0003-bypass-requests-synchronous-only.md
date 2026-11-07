# Bypass requests resolve synchronously only, no persisted queue

A bypass request (`request_comment_exception`) needs a human to approve,
deny, or request changes on a stripped comment. Two shapes exist for
delivering that: prompt the human live via `ctx.ui` right when the agent
calls the tool, or record the request in a persisted, project-scoped
store for a later batch review pass — the mechanism the sibling
`defer-review-mode` proposal already sketches. We chose live-only for
this effort: every bypass request is resolved synchronously, in the
moment, and nothing is ever written to disk. Batched, deferred review
stays exactly where it already lives, as `defer-review-mode`'s own
separate, not-yet-built proposal — deliberately not merged into gate
mode's initial scope, even though the two share an obvious kinship
(both strip a comment out of a call and hold it for human judgment).

The corollary: when no UI is available at all (print mode, JSON mode, or
inside a subagent, which pi always runs with `--mode json -p`),
`request_comment_exception` is not registered as a tool in that session,
rather than falling back to a queue nobody asked it to build. There is
no one to answer a live prompt in that context, and no persisted queue
for it to fall into either, so a subagent can never get a comment past
the threshold — the strip message is worded to explain why, but nothing
about the attempt is logged or recorded anywhere.

## Consequences

- No storage, no `/review-comments`-style command, no `deferAlways`
  config exist as part of gate mode. Anything shaped like batch review
  belongs to `defer-review-mode`, if and when that's built.
- A subagent (or any print/JSON-mode session) has no path at all to a
  longer comment landing — it must shorten to the threshold, full stop.
- If defer-review-mode is built later, unifying it with gate mode's
  bypass path is a deliberate follow-up integration, not something this
  decision already accounts for.
