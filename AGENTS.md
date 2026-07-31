## Agent skills

### Issue tracker

Issues live as GitHub issues in `aaronkyriesenbach/pi-packages`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels used as-is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout — root `CONTEXT-MAP.md`, one `CONTEXT.md` per package under
`packages/*`. See `docs/agents/domain.md`.

### Monorepo layout

Bun workspaces (`packages/*`). Root config (TypeScript, ESLint, Prettier,
`.npmrc`, `LICENSE`, `.gitignore`, `.yamllint`) is shared and strict; each
package extends it and only adds justified, minimal per-package deltas.
CI (`ci.yaml`) change-detects which packages' files changed via
`dorny/paths-filter` and scopes typecheck/lint/test/format checks to those
packages only.
