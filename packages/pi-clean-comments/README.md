# pi-clean-comments

A [pi](https://pi.dev) extension that nudges the agent to reconsider every
comment it adds or edits, favoring deletion unless a comment earns its
place.

## Why

Coding agents tend to over-comment: narrating obvious lines, restating a
function name in prose, or leaving comments that don't survive the code
they described being refactored. This extension adds a lightweight,
structural check (no NLP, no allowlist) that fires whenever an Edit or
Write tool call touches at least one comment line, appending a note that
quotes back each added comment's file:line and text and reminds the agent
to keep only comments that explain a non-obvious why or gotcha —
everything else should be deleted or cut to the minimum.

The note is wrapped in a `<comment-check required severity="...">` block
and quotes the exact lines added rather than just a count — a generic "N
touched" tally is easy to skim past after the tenth occurrence, but the
agent's own words quoted back at it are harder to wave off.

Contiguous added comment lines are grouped into one block, and both the
wording and the tag's `severity` attribute scale with block length:

| Block length | Severity | Framing                                                           |
| ------------ | -------- | ----------------------------------------------------------------- |
| 1 line       | `single` | Light sanity check — does this line earn its place?               |
| 2–4 lines    | `short`  | Justify why it isn't one line, or delete it.                      |
| 5+ lines     | `long`   | Almost never required — justify every line or cut it to ≤2 lines. |

A 10-line comment block gets a noticeably harsher note than a single
trailing one-liner, since it's the case most likely to be narration
instead of a genuine why/gotcha.

### Block comments

For file extensions with a registered `/* */`-style delimiter pair (most
C-style languages — see `BLOCK_COMMENT_TOKENS` in
`extensions/index.ts`), detection is block-aware in both tool paths:

- **`write`**: the full supplied file body is scanned for open/close
  delimiter pairs, so every line of a multi-line block comment is flagged,
  not just the ones with their own token.
- **`edit`**: the file's current on-disk content is read after the edit
  and scanned the same way, then intersected with the lines the patch
  actually added. This means an edit that appends a new line into the
  middle of a block comment opened by an earlier, unrelated edit is still
  flagged, even though that open delimiter never appears in the current
  diff's hunk context. If the post-edit read fails (file deleted/moved,
  permission error, etc.), detection falls back to patch-only, line-token
  detection for that call rather than reporting nothing.

File extensions with no registered block delimiter (Python, YAML, shell,
Ruby, etc.) are unaffected and keep the exact line-token-only behavior
they've always had.

## Configuration

Config is resolved per project from `<cwd>/.pi/pi-clean-comments.json`,
falling back to `~/.pi/agent/extensions/pi-clean-comments.json`, then
hardcoded defaults. Project values win over user values on a per-key basis.

```json
{
  "enforcement": "gate",
  "threshold": 2,
  "allowAgentBypassRequest": false,
  "bashFileWrites": "block",
  "bypassRequestTimeoutSeconds": 300
}
```

| Key                           | Default   | Meaning                                                                                                                                                       |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enforcement`                 | `"nudge"` | `"nudge"` only reminds; `"gate"` also strips any comment block over `threshold` before it lands.                                                              |
| `threshold`                   | `2`       | Max lines a comment block may reach under `gate` before it's stripped; `0` strips every comment. Independent of nudge's severity tiers.                       |
| `allowAgentBypassRequest`     | `false`   | Under `gate`, whether the strip note tells the agent it can ask a human to reinstate a stripped block.                                                        |
| `bashFileWrites`              | `"block"` | `"block"` rejects `bash` calls that write a source file via a heredoc or an inline script; `"off"` lets them through. Independent of `enforcement`.           |
| `bypassRequestTimeoutSeconds` | `300`     | How long `request_comment_exception` waits for the human before telling the agent to proceed without the comment (and flag it at the end); `0` waits forever. |

Project config overrides user config on a per-key basis; keys missing from
both fall back to the defaults above.

Under `gate`, a comment block exceeding `threshold` is removed from the
`write`/`edit` call before it executes — any unrelated code change bundled
in the same call still lands. The agent is told exactly which lines were
stripped. Blocks at or under `threshold` are untouched and still receive
the usual severity-scaled nudge.

### File writes via `bash`

Agents often write files through `bash` — `cat > file.yaml <<'EOF' … EOF`, or
an inline `python3 - <<'E' … open(p, 'w').write(s) … E` — which never
reaches the `write`/`edit` checks. With `bashFileWrites: "block"` (the
default), a `bash` call is rejected, unrun and unmodified, when:

- it sends a heredoc into a file with `>`, `>>` or `tee`, or
- it runs an inline `python`, `node`/`bun`/`deno`/`tsx` or `ruby` script that
  calls a file-write API (`open(…, 'w')`, `Path.write_text`,
  `fs.writeFileSync`, `File.write`, …),

and the target's extension has registered comment syntax. Script targets
are every path-like string literal in the command (`'src/a.ts'`), since the
write call usually takes a variable. The agent is told to resubmit through
`write`/`edit`.

Allowed through: unknown extensions (`.md`, `.json`, none), targets the
scan can't resolve (`$VAR`, `$(…)`, `~/…`, `sys.argv`), paths outside the
project, and heredocs that aren't file writes (`git commit -m "$(cat <<EOF …)"`,
`kubectl apply -f - <<EOF`). Scripts that read one source file and write an
unrelated one are blocked too (the heuristic can't tell which literal is the
write target). Other write methods (`printf > file`, `sed -i`, scripts run
from a file) aren't detected. See
`docs/adr/0004-block-bash-file-writes.md` for why this blocks instead of
parsing and rewriting.

### Agent-requested comment exceptions

When `allowAgentBypassRequest` is `true` and the session has an interactive
UI (`ctx.hasUI`), a `request_comment_exception` tool is registered at
session start. It lets the agent ask a human, live, to let a comment gate
mode would otherwise strip land anyway, instead of shortening or deleting
it. The tool takes the same `{ path, edits: [{ oldText, newText }] }` shape
as the built-in `edit` tool, plus a required, non-empty `reason`.

Calling it presents the current and requested text for each edit, the
file path, and the reason to the human as a three-way choice:

- **Approve** — the edit is applied through the exact same mechanism the
  built-in `edit` tool uses, including its `oldText` staleness check. A
  stale `oldText` fails the same way a stale `edit` call would.
- **Deny** — the tool returns a result telling the agent the request was
  denied; nothing is applied.
- **Request changes** — the human's feedback text is collected and
  returned to the agent, which can revise and call the tool again.

Every request is resolved synchronously, in the moment — nothing about
it (approved, denied, or attempted) is ever persisted to disk. When no UI
is available (print mode, JSON mode, or inside a subagent, which pi
always runs with `--mode json -p`), the tool is not registered at all, so
a longer comment can never land in that context; it must be shortened
instead. See `docs/adr/0003-bypass-requests-synchronous-only.md` for the
full rationale.

## Install

```bash
pi install npm:@aaronkyriesenbach/pi-clean-comments
```

Or add it to `.pi/settings.json` / `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:@aaronkyriesenbach/pi-clean-comments"]
}
```

## Development

```bash
bun install
bun run typecheck
bun run test:coverage
```

## License

MIT
