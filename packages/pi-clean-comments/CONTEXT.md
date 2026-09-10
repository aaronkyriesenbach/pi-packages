# pi-clean-comments

A Pi extension that nudges the agent to reconsider every comment it adds or
edits in an Edit/Write tool call, favoring deletion unless a comment earns
its place.

## Language

### Comment detection

**Line comment**:
A comment whose extent is exactly one source line, delimited by a prefix
token with no explicit close (e.g. `//`, `#`, `--`).

**Block comment**:
A comment whose extent is delimited by an explicit open and close token
pair and may span multiple lines (e.g. `/* ... */`). Not limited to
C-style delimiters — the term also covers other open/close pairs (e.g.
Lua's `--[[ ]]`, HTML's `<!-- -->`).

### Enforcement

**Nudge (mode)**:
The default enforcement mode: appends a severity-scaled reminder to a
comment-touching `write`/`edit` result without altering or blocking the
call.

**Gate (mode)**:
An enforcement mode that, in addition to nudging, strips any comment
block exceeding the threshold out of a `write`/`edit` call before it
lands, letting the rest of that call proceed unblocked.
_Avoid_: hard-block, block mode — gate never rejects a whole call, it
only ever strips the offending lines from it.

**Threshold**:
The configured maximum line count a comment block may reach under gate
mode before it is stripped. Independent of the nudge severity tiers
(single/short/long).

**Bypass request**:
An agent-initiated call asking a human to let a comment block gate mode
would otherwise strip land anyway, requiring the human to approve, deny,
or request changes before it can be applied.
_Avoid_: exception request, override.
