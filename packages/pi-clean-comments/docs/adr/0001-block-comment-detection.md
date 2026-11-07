# Detect block comments via full-file disk reads, no nesting

Line-comment detection works purely on the diff patch, one line at a time,
because a line-token comment is self-contained: every fact needed to
classify a line lives on that line. A block comment (`/* ... */`) breaks
that assumption — an interior line has no token of its own, and an edit can
add lines into the middle of a block opened by an earlier, unrelated edit,
invisible in the current patch's hunk context. We considered restricting
detection to blocks fully self-contained within one patch's added lines
(no disk I/O, but misses the common case of appending into an existing
open block) against reading the post-edit file from disk (precedent:
`pi-package-manager` already reads files via `node:fs/promises` from an
extension) and running a stateful open/close scan, then intersecting the
result with which lines the patch actually added. We chose the disk read:
missing newly-authored lines inside a pre-existing block undermines the
whole point of the package.

We also chose a generic open/close delimiter-pair data model (not
hardcoded to `/* */`) so future non-C-style pairs (Lua's `--[[ ]]`, HTML's
`<!-- -->`) can be added later without a redesign, added additively as a
new `BLOCK_COMMENT_TOKENS` map alongside the existing `COMMENT_TOKENS`
rather than restructuring it, and we chose not to track nesting depth even
for the languages that permit it (Rust, Swift, Kotlin, Scala) — a nested
block is treated as closed at the first `*/`. We also chose not to
special-case string/regex literals containing `/*` or `*/` (e.g.
`"/* not a comment */"`), matching how the existing line-token model
already can't tell a `//` inside a string from a real comment.

## Consequences

- A `/*`/`*/` (or future delimiter pair) appearing inside a string or
  regex literal is a known, accepted false-positive source — no lexer
  dependency was introduced to avoid it.
- A genuinely nested block comment in Rust/Swift/Kotlin/Scala is
  mis-scanned past its first `*/`; anything textually following on that
  line is treated as ordinary code, not comment.
- If the post-edit disk read fails (file deleted/moved/permission error
  between the edit completing and the handler running), detection for
  that one call falls back to today's patch-only, line-token-only
  behavior rather than reporting nothing.
- Any file extension without a registered block delimiter pair (Python,
  YAML, shell, Ruby, etc.) is unaffected — it keeps taking the exact
  line-token-only code path it takes today.
