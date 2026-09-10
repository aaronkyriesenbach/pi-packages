# pi-clean-comments

A Pi extension that nudges the agent to reconsider every comment it adds or
edits in an Edit/Write tool call, favoring deletion unless a comment earns
its place.

## Language

**Line comment**:
A comment whose extent is exactly one source line, delimited by a prefix
token with no explicit close (e.g. `//`, `#`, `--`).

**Block comment**:
A comment whose extent is delimited by an explicit open and close token
pair and may span multiple lines (e.g. `/* ... */`). Not limited to
C-style delimiters — the term also covers other open/close pairs (e.g.
Lua's `--[[ ]]`, HTML's `<!-- -->`).
