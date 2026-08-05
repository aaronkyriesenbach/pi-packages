# Use `unbash` for bash command parsing

This package needs to reliably find every Command Position in an
agent-issued `bash` string — including nested command substitutions,
subshells, and wrapper commands like `find -exec`/`sudo`/`xargs` — to decide
whether it contains a Blockable Invocation. This repo's other two packages
(`pi-frozen-defaults`, `pi-clean-comments`) carry zero runtime dependencies
beyond the `@earendil-works/pi-coding-agent` peer dependency; taking on a
parser here breaks that precedent.

We evaluated a hand-rolled regex/token-split (risks subtly wrong quoting and
would silently miss nested substitutions), `shell-quote` (a flat tokenizer,
not a grammar — doesn't give real Command Position structure), and
`tree-sitter-bash` via WASM (what Google's `gemini-cli` uses for its
heavier, security-critical permission system — WASM init and native-binding
weight are overkill for a reason-message nudge).

We chose [`unbash`](https://www.npmjs.com/package/unbash): a synchronous,
TypeScript-native bash AST parser that is itself zero-dependency, explicitly
built for "audit commands against a safety policy," and already proven for
the hardest part of this problem (`find -exec`/wrapper unwrapping) by
`pi-guard`, a published `pi` extension solving an adjacent problem.

## Consequences

- `unbash` becomes this package's one runtime dependency — an intentional,
  narrow exception to this repo's zero-runtime-dependency norm, not a
  precedent for pulling in dependencies freely in other packages.
- Detection is static parsing, not execution — it cannot resolve dynamic
  command names (e.g. a command built from a variable) and fails open
  (allows the command through unblocked) whenever `unbash` reports parse
  errors, rather than blocking on something it can't verify.
