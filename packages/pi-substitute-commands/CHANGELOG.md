# Changelog

## 1.0.0 (2026-08-05)


### Features

* add context/adrs for pi-substitute commands ([1e7e0cf](https://github.com/aaronkyriesenbach/pi-packages/commit/1e7e0cfc8fcd888fd1e76b8b3732b72fd61db18c))
* detect and block simple find/grep invocations ([90d7e81](https://github.com/aaronkyriesenbach/pi-packages/commit/90d7e813250b8b10fdfddf79bad698573b711962))
* lower coverage threshold, remove junk tests ([52513b8](https://github.com/aaronkyriesenbach/pi-packages/commit/52513b866f7f5262a7c8baacaaf823725000707c))
* recurse into substitutions/subshells in pi-substitute-commands ([16e965f](https://github.com/aaronkyriesenbach/pi-packages/commit/16e965f0df6ecb476971123e1f599741f9330928))
* scaffold pi-substitute-commands package ([15785c8](https://github.com/aaronkyriesenbach/pi-packages/commit/15785c86d60d72f39f2f14eb328e522e5953028a))
* unwrap wrapper commands in pi-substitute-commands ([efb0490](https://github.com/aaronkyriesenbach/pi-packages/commit/efb0490ec4034b490b36fc7d90aa56cc17e09bf7))

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
