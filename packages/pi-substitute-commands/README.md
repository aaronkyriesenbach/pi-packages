# pi-substitute-commands

A [pi](https://pi.dev) extension that hard-blocks agent-issued `bash` tool
calls containing a disallowed command, telling the agent to use the
recommended replacement instead. Ships with one Substitution Pair (`find`/
`grep` family → `fd`/`rg`), structured so future pairs are a small code
change.

## Why

Agent instructions frequently say "use `fd`/`rg` instead of `find`/`grep`" —
they're faster, respect `.gitignore`, and have saner defaults — but a prose
instruction is easy for an agent to forget once a command gets wrapped in
`sudo`, piped through `xargs`, buried inside a `bash -c` string, or spawned
from a `find -exec`. This extension enforces that guidance structurally: it
parses every `bash` tool call the agent issues, resolves the command down to
what would actually execute, and blocks the call outright if `find`/`grep`/
`egrep`/`fgrep`/`zgrep` would run — no matter how deeply it's nested inside
wrappers, subshells, or command substitutions.

## What it blocks

The check parses the command with [`unbash`](https://www.npmjs.com/package/unbash)
and looks for a blocked command name in **Command Position** — the leading
word of a command, or the resolved sub-command of a supported wrapper —
anywhere in the parsed structure. A few examples:

| Command                                  | Blocked because                               |
| ---------------------------------------- | --------------------------------------------- |
| `grep -rn "TODO" src/`                   | `grep` in Command Position — use `rg`         |
| `find . -name "*.ts"`                    | `find` in Command Position — use `fd`         |
| `sudo grep -r "secret" /etc`             | `grep` behind a `sudo` passthrough wrapper    |
| `find . -type f -exec grep -l foo {} \;` | `grep` inside `find -exec`'s sub-command      |
| `bash -c "cat a.txt \| grep foo"`        | `grep` inside a `bash -c` nested script       |
| `echo "$(grep -c foo file)"`             | `grep` inside a `$(...)` command substitution |

`git grep`/`git-grep` is exempt — it invokes git's own pattern search, not
the standalone `grep` binary. If the command can't be parsed with
confidence (a syntax error, or anything `unbash` reports parse errors for),
the check **fails open**: the call is allowed through unblocked rather than
guessed at. The extension only ever inspects the command — it never
rewrites or mutates it.

Resolution follows Wrapper Unwrapping through:

- Passthrough wrappers: `sudo`, `xargs`, `nice`, `nohup`, `env`, `strace`
- Flag wrappers with a nested script: `bash -c`, `sh -c`, `zsh -c`
- Exec wrappers: `find -exec`/`-ok`, `fd -x`/`--exec`/`-X`/`--exec-batch`

and recurses into command substitutions (`$(...)` and backticks) and
subshells (`(...)`) wherever they appear, so a blocked command nested
several layers deep is still caught.

When a call is blocked, the agent sees a reason naming every distinct
disallowed command found and its recommended replacement, e.g.:

```
Blocked: this command uses disallowed command(s): `grep` (use `rg` instead), `find` (use `fd` instead).
```

## Install

```bash
pi install npm:@aaronkyriesenbach/pi-substitute-commands
```

Or add it to `.pi/settings.json` / `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:@aaronkyriesenbach/pi-substitute-commands"]
}
```

## Development

```bash
bun install
bun run typecheck
bun run lint
bun run format:check
bun run test:coverage
```

## License

MIT
