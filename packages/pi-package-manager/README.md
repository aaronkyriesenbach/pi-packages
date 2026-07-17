# pi-package-manager

A [pi](https://pi.dev) extension that adds a `/packages` command for
managing installed Pi packages — list, enable/disable, and auto-update —
without leaving your session.

## Why

Pi packages are configured through `settings.json`, but there's no
interactive way to see what's installed, what's enabled, or what has an
update available. This extension adds a `/packages` TUI that shows all
installed packages and lets you toggle them, save changes back to
`settings.json`, and configure auto-update — all without hand-editing JSON.

- **List** every installed package with its version, enabled/disabled
  status, and the resources it provides (extensions, skills, prompts,
  themes).
- **Toggle** a package on/off for the current session, or persist the
  change back to `settings.json`.
- **Auto-update**: on session start, checks npm for newer versions of
  installed packages and runs `pi update --extensions` when one is found.

## Install

```bash
pi install npm:@aaronkyriesenbach/pi-package-manager
```

Or add it to `.pi/settings.json` / `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:@aaronkyriesenbach/pi-package-manager"]
}
```

## Usage

Run `/packages` in a session to open the package list:

| Key              | Action                                                        |
| ---------------- | ------------------------------------------------------------- |
| `↑`/`↓`, `j`/`k` | Navigate                                                      |
| `space`          | Toggle the selected package on/off (session-only until saved) |
| `p`              | Persist all toggles to `settings.json`                        |
| `u`              | Toggle auto-update on/off                                     |
| `enter`          | Close                                                         |
| `esc`            | Close, discarding unsaved toggles                             |

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run format:check
npm run test:coverage
```

See [`AGENTS.md`](./AGENTS.md) for the full command reference, project
structure, and code style conventions.
