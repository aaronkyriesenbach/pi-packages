## Commands

### Build

- **Build**: `npm run build` — `tsc --project tsconfig.build.json` → `dist/`
- **Type-check**: `npm run typecheck` — `tsc --noEmit` (build projects only, broader include)
- **Lint**: `npm run lint` — `eslint .`
- **Format**: `npm run format` — `prettier --write .` (check only: `npm run format:check`)

### Test

- **All**: `npm test` — `vitest run` (must pass before commits)
- **Single file**: `npx vitest run tests/packages.test.ts`
- **Single test**: `npx vitest run -t "test name pattern"`
- **Watch**: `npm run test:watch` — `vitest` in watch mode
- **Coverage**: `npm run test:coverage` (enforced at 100% lines/branches/functions/statements)

## Stack

- **Runtime**: Bun (primary), Node.js 22 compatible
- **Language**: TypeScript 5.7, strict mode, ES2022 target
- **Package manager**: npm
- **Linting**: ESLint 9 (`strict-type-checked` + `stylistic-type-checked`), Prettier 3
- **Testing**: Vitest 3 with @vitest/coverage-v8
- **Pi peers**: @earendil-works/pi-ai, @earendil-works/pi-coding-agent, @earendil-works/pi-tui, typebox

## Structure

```
lib/
  types.ts                   — PackageInfo, Settings, AutoUpdateConfig, PackageFilter
  packages.ts                — Parse settings → PackageInfo list (pure logic)
  settings.ts                — Toggle package enabled/disabled in place
  session.ts                 — Session override restoration + auto-update runner
  updates.ts                 — Semver comparison + nextCheck scheduling
  utils.ts                   — mapsEqual, applyOverrides (pure)
  fs-helpers.ts              — All filesystem I/O (settings.json, package.json, auto-update.json)
  handle-packages-command.ts — Orchestrates the /packages TUI command flow
  resolve-package.ts         — Resolve individual settings entries to PackageInfo
  package-list.ts            — TUI package list component (interactive table)
index.ts                     — Extension entry point: commands + lifecycle hooks
tests/                       — Vitest tests, mirrors lib/ structure
  helpers/                   — Test doubles: fake-api.ts, mocks.ts
docs/agents/                 — Agent workflow docs (domain, issues, triage)
dist/                        — Build output (generated, do not edit)
```

## Boundaries

- 🚫 **Never edit**: `.pi-subagents/`, `dist/`, `coverage/`, `node_modules/`
- 🚫 **Never commit**: `node_modules/`, `dist/`, `coverage/`, `.pi-subagents/`
- ⚠️ **Ask before**: Changing `package.json` `pi.extensions` field, adding npm dependencies, modifying TUI component behavior
- ✅ **Go ahead**: Create branches, edit `lib/`, `tests/`, `index.ts`, run any command

## Code Style

- Strict TypeScript. No `any` — use `unknown` and narrow.
- `interface` for object shapes, `type` for unions/aliases.
- Async/await for all I/O — never `.then()` chains.
- Pure logic in `lib/*.ts`, I/O only in `lib/fs-helpers.ts` and `index.ts`.
- Dependency injection via typed parameter objects (e.g. `AutoUpdateDeps`, `CommandDeps`).
- Named exports preferred over default exports.
- Guard clauses early, return early — avoid deep nesting.

```typescript
// ✅ Good — pure logic, dependency injection, guard clause
async function checkAndRunAutoUpdate(
  config: AutoUpdateConfig,
  settings: Settings,
  deps: AutoUpdateDeps,
): Promise<boolean> {
  if (!deps.shouldCheckForUpdates(config)) return false;
  const npmPackages = (settings.packages ?? []).filter((e) => {
    const s = typeof e === 'string' ? e : e.source;
    return s.startsWith('npm:');
  });
  if (npmPackages.length === 0) return false;
  // ...
}

// ❌ Bad — raw Promise chains, inline I/O, implicit deps
function checkUpdates(config) {
  return readFile(somePath).then((raw) => {
    return fetch('https://...').then((res) => res.json());
  });
}
```

### Naming

- Functions / variables: camelCase | Types / interfaces: PascalCase | Files: kebab-case
- Test files: `*.test.ts` in `tests/`

## Testing

- **Framework**: Vitest with `describe` / `it` / `expect`
- **Location**: `tests/` directory, one file per source module
- **Test doubles**: `tests/helpers/fake-api.ts` (command deps), `tests/helpers/mocks.ts` (fs mock setup)
- **Fixtures**: Declared inline in tests, not in separate JSON files
- **Coverage target**: 100% lines/branches/functions/statements (enforced in CI via `test:coverage`)
- New features and bug fixes require tests.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout. See `docs/agents/domain.md`.
