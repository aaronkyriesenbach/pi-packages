# Changelog

## 0.1.0 (2026-08-05)

### Features

- Hard-block agent-issued `bash` tool calls that would run `find`, `grep`,
  `egrep`, `fgrep`, or `zgrep` in Command Position, telling the agent to use
  `fd`/`rg` instead.
- Resolve the real sub-command through Wrapper Unwrapping (`sudo`, `xargs`,
  `nice`, `nohup`, `env`, `strace`, `bash`/`sh`/`zsh -c`, `find -exec`/`-ok`,
  `fd -x`/`--exec`/`-X`/`--exec-batch`) so a blocked command can't be hidden
  behind a wrapper.
- Recurse into command substitutions (`$(...)`, backticks) and subshells
  (`(...)`) so a blocked command nested inside either is still caught.
- Exempt `git grep`/`git-grep`, and fail open (allow the call through
  unblocked) whenever the command can't be parsed with confidence.
