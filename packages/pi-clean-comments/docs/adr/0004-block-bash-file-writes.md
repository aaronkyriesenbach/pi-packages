# Block bash file writes instead of parsing and rewriting them

Comment checks run on `write`/`edit` calls, so an agent can sidestep them by
writing the file from `bash`. The obvious fix is to extract the file content
from the command and run it through the gate's strip logic. We rejected it:
the content lives in heredocs, shell quoting and interpreter source, and
rewriting a shell command in place risks corrupting it. Instead the
`tool_call` handler returns `{ block: true, reason }` and the agent resubmits
through `write`/`edit`, where the existing checks apply unchanged. This is the
opposite of ADR 0002's strip-not-block because here there is no safe way to
strip.

Interpreter scripts (Python, Node, Ruby) name their targets through variables,
so there is no call-site path to resolve. We flag a script when it both calls
a write API and contains a path-like string literal with a known comment
extension, accepting false positives (a script that reads `a.ts` and writes
`b.txt`) over writing a parser per language. A false positive costs one retry
through `write`/`edit`.

## Consequences

- Scripts run from a file, `sed -i`, `printf >` and dynamically built paths
  are not detected.
- Adding an interpreter is one entry in `INTERPRETER_WRITE_RULES`.
