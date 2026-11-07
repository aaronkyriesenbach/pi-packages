# Proposal: defer & batch-review mode

## Problem

An agent working autonomously shouldn't have to stop and ask about every
comment as it goes, but comments still shouldn't ship unreviewed. Need a
mode where comments are withheld entirely during implementation, then
presented together for one human pass at the end.

## Idea

While this mode is active, no comment (or no over-threshold comment,
depending on config) is ever written to a file directly. It's stripped out
at write time and recorded. Once implementation is done, the user runs a
review command, sees everything that was withheld across the whole task,
and approves/edits/rejects each one. Approved comments then get written
back in.

## Mechanism (sketch)

- Hook `tool_call` for `edit`/`write`, same detection as
  [threshold-approval mode](./threshold-approval-mode.md). Instead of
  prompting, mutate the input to drop the comment lines and let the
  (now comment-free) edit proceed.
- Record each stripped item (file, exact text, timestamp, source) in a
  **project-scoped file store** (e.g. one JSON file per item under a
  `.pi/`-adjacent state directory), not session-scoped storage. This
  matters: pi's `subagent` tool spawns child processes with
  `--no-session`, so anything persisted via `pi.appendEntry()` inside a
  subagent's own extension instance is lost the moment that process
  exits. A store keyed by `cwd` survives across the parent session and
  every subagent that shares that working directory.
- The `tool_result` note back to the agent just references an item id
  ("comment withheld, recorded as #7") — the agent doesn't need to
  remember the exact text itself. Memory of _what_ was removed is the
  extension's job, not the model's.
- Surface a standing indicator (status widget / reminder on
  `agent_settled`) so pending items aren't silently forgotten.
- `/review-comments` (or similar): lists all pending items regardless of
  which process/subagent produced them, lets the user approve, edit
  (`ctx.ui.editor()`), or reject each.
- **Reinsertion is not the extension's job.** Rather than trying to
  splice approved text back in via stored anchors (fragile once
  surrounding code has drifted), hand the approved list to an agent as a
  normal follow-up task — "add these approved comments back at the
  appropriate spots" — so it's done with a fresh, current read of the
  file.

## Relationship to threshold-approval mode

Both modes need the same detection step and the same "strip + persist"
capture path. Threshold-approval mode is really "try a live prompt first,
fall back to this" for contexts where `ctx.hasUI` is true. Likely worth
building the capture/store/review pipeline once and having both modes
sit on top of it.

## Open questions to scope

- Store location: inside the repo under a gitignored path, vs. an
  OS-level state dir keyed by a hash of the project path (never touches
  the repo, less discoverable).
- Enforcement strength: passive status widget vs. actively blocking the
  agent from ending the turn/session while items are pending.
- Does "defer" mean _all_ comments are withheld, or only over-threshold
  ones (i.e. can this mode compose with a threshold rather than being
  all-or-nothing)?
- Who performs reinsertion by default — the current session's agent, or
  a dedicated subagent spawned just for that follow-up?
- What happens to an item if the user runs review mid-task rather than
  at the end (multiple review passes vs. one final pass)?
- Expiry/cleanup of the pending store (per task, per session, manual only?).
