# pi-substitute-commands

A `pi` coding-agent extension that hard-blocks agent-issued `bash` tool calls
containing a disallowed command, telling the agent to use the recommended
replacement instead. Ships with one Substitution Pair (`find`/`grep` family →
`fd`/`rg`), structured so future pairs are a small code change.

## Language

**Substitution Pair**:
An internal mapping from one or more blocked command names (e.g. `grep`,
`egrep`, `fgrep`, `zgrep`) to a single recommended replacement command name
(e.g. `rg`). The table this package checks parsed bash commands against.
_Avoid_: Rule, denylist entry (implies a user-configurable policy engine like
`pi-guard`'s, which this isn't — v1's table is internal and code-only)

**Command Position**:
A location in a parsed bash command where bash would resolve and execute a
program — the leading word of a simple command, or a sub-command exposed by
Wrapper Unwrapping. Distinguished from the same text appearing as an
argument, a quoted string, or a filename.
_Avoid_: Command word, invocation site

**Wrapper Unwrapping**:
Resolving a wrapper command (`sudo`, `xargs`, `env`, `nice`, `nohup`,
`strace`, `bash -c`/`sh -c`/`zsh -c`, `find -exec`/`-ok`, `fd
-x`/`--exec`/`-X`/`--exec-batch`) to expose the real sub-command(s) it
invokes, so a Blockable Invocation is checked against the actual target
program rather than just the wrapper's own name.
_Avoid_: Shell expansion (that's bash's own runtime word-splitting/expansion
mechanism — a different concept from statically resolving a wrapper's
argument structure)

**Blockable Invocation**:
An occurrence of a Substitution Pair's blocked command name found in Command
Position anywhere in a bash command's fully parsed structure — including
inside command substitutions, subshells, and Wrapper Unwrapping. A single
`bash` tool call may contain several; all distinct ones (deduped by command
name) are reported together in one block reason.
_Avoid_: Violation, match (too generic — doesn't convey that it's specifically
a Command Position hit against the Substitution Pair table)
