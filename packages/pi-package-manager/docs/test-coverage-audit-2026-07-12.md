# Test Coverage Audit: pi-package-manager

**Date**: 2026-07-12

## Summary

- **Overall line coverage**: 20.15%
- **Overall branch coverage**: 82.35%
- **Overall function coverage**: 90.9%
- **Coverage tool**: Vitest with @vitest/coverage-v8
- **Modules with no tests**: 1 (`index.ts` — 661 lines)
- **Total findings**: 2 Critical, 4 High, 3 Medium, 2 Low

The 20% overall line coverage is misleading — the pure-logic library files (`lib/`) average 92% line coverage with strong assertions. The entire coverage deficit comes from `index.ts` (661 lines, 0% coverage), which contains ALL the I/O, session management, TUI rendering, and auto-update orchestration.

---

## Critical Gaps

### `index.ts` — **Critical**

**Issue**: Zero test coverage on the main extension entry point. 661 lines with 13 internal functions, 3 event handlers, 2 command handlers, a TUI component class with 7 methods, and all filesystem I/O.

**Impact**: This is the sole consumer of the tested library modules. Every user-facing feature flows through this file:

- `/packages` command handler (settings read/write, package resolution, reload)
- `PackageListComponent` (keyboard input, render, state persistence)
- `session_start` event (crash recovery, session override restoration, auto-update check + `pi update` execution + reload)
- `session_shutdown` event (backup restoration)
- Filesystem I/O (settings.json, package.json, auto-update.json, backup/restore)

**Recommendation**: This file needs a comprehensive integration test suite. Break it down:

1. Extract the `PackageListComponent` into its own module for unit-testable rendering and input handling
2. Test the filesystem helpers (read/write/backup/restore) with a temp directory
3. Test the `/packages` command handler with mocked ExtensionAPI
4. Test the session lifecycle handlers (`session_start`, `session_shutdown`) with mocked session state
5. Test `resolvePackageEntry` with real package.json fixtures

### `lib/settings.ts` — `togglePackage` is dead code **Critical**

**Issue**: `togglePackage` is exported from `lib/settings.ts` and has 5 well-written tests, but is **never imported by `index.ts`** or any other source file. The toggling logic is duplicated inline in `PackageListComponent.persistState()` (lines 283-311 of `index.ts`). Additionally, `isAllResourcesEmpty` and `isFilterEnabled` are duplicated — identical logic exists in both `index.ts` and `lib/settings.ts`.

**Impact**: Even if `togglePackage` had 100% coverage, the actual runtime code path in `index.ts` is completely untested. The duplicate implementation could diverge.

**Recommendation**: Either wire `index.ts` to use `togglePackage` from `lib/settings.ts` (removing the duplicate), or delete `togglePackage` and its tests if the inline version is intentional. Do not leave diverged implementations.

---

## Missing Edge Cases

### `lib/packages.ts::resolveDeclared` — **High**

**Issue**: The exclusion path (`-` prefix filter entries) and the plain-entry path (neither `+` nor `-`) are completely untested. Uncovered lines 97-98 and 104-112.

**Recommendation**: Add tests for:

- Exclusion-only filters: `["-foo", "-bar"]` against `["foo", "bar", "baz"]` → should return `["baz"]`
- Plain entries (no prefix): filter `["foo"]` → should return `["foo"]`
- Mix of `+` and `-`: `["+foo", "-bar"]` → should return `["foo"]` (forced takes precedence)

### `lib/packages.ts::resolveFilterEntry` — **Medium**

**Issue**: The branch where `filter.source` does NOT start with `"npm:"` (line 54, the `else` of the ternary) is untested.

**Impact**: Low — all current callers use `npm:` prefixed sources. But the function accepts non-`npm:` sources and would silently use the full string as the package name.

**Recommendation**: Add a test with a non-`npm:` source, or add runtime validation that rejects non-`npm:` sources explicitly.

### `lib/updates.ts::isNewerVersion` — **High**

**Issue**: Two branch paths are uncovered:

- Lines 13-14: `segments[i] ?? 0` — nullish coalescing for versions with <3 segments (e.g., `"1.2"` vs `"1.2.0"`)
- Line 21: `if (!curr.preRelease && lat.preRelease) return false;` — release vs pre-release comparison

**Recommendation**: Add tests for:

- Shorter version strings: `isNewerVersion("1.2", "1.2.0")` → should be `false`
- Release current, pre-release latest: `isNewerVersion("1.0.0", "1.0.0-beta.1")` → should be `false`
- Also consider adding tests for invalid inputs (empty strings, non-numeric segments) — currently `parseVersion` would produce `NaN` segments

### `lib/settings.ts::togglePackage` — **Medium**

**Issue**: The early-return branch `if (!settings.packages) return false;` (line 13) is uncovered. Also untested: what happens when toggling a package that has *partial* filtering (e.g., only `extensions: []` but skills are still populated)?

**Recommendation**: Add tests for:

- `togglePackage({}, "npm:foo")` — `settings.packages` is undefined → should return `false`
- `togglePackage` with a partially-filtered package (e.g., `{source: "npm:foo", extensions: [], skills: ["+bar"]}`) — should it disable entirely or toggle selectively?

---

## Under-Tested Critical Paths

### `index.ts::piExtmgr` (entire extension entry point) — **Critical**

**Coverage**: 0% lines, 0% branches
**Impact**: Every user-facing feature. The `/packages` command, session lifecycle, auto-update, and crash recovery are all untested.
**Recommendation**: See Critical Gaps above. This must be the top priority.

### `lib/packages.ts::resolveFilterEntry` — **High**

**Coverage**: Has uncovered branches (79.41% branch coverage)
**Impact**: Used by `index.ts`'s `resolvePackageEntry` and `getPackagesFromSettings`. Filter resolution is central to extension loading.
**Recommendation**: Add the exclusion and plain-entry tests identified above. Target 95%+ branch coverage.

---

## Ambiguous Behavior

### `lib/settings.ts::togglePackage` — dead code or design intent?

**Question**: Is `togglePackage` meant to be the canonical toggling logic that `index.ts` should consume, or is the inline duplication in `PackageListComponent.persistState()` intentional? The tests for `togglePackage` currently validate behavior that doesn't exist at runtime.

**Recommendation**: Decide — either deduplicate by wiring `index.ts` to use `togglePackage`, or remove `togglePackage` and its tests. The current state is code duplication with untested runtime behavior.

### `lib/updates.ts::parseVersion` — no input validation

**Question**: What happens with invalid version strings? `parseVersion("not-a-version")` produces `{segments: [NaN], preRelease: undefined}`. `isNewerVersion` will then compare `NaN < NaN` (false). This is silently broken — no error, no warning.

**Recommendation**: Add input validation or document that callers must pass valid semver. Add a test for the edge case to make the expected behavior explicit.

### `index.ts::resolvePackageEntry` vs `lib/packages.ts::getPackagesFromSettings` — overlapping responsibility

**Question**: Both functions resolve package entries from settings. `index.ts` has its own `resolvePackageEntry` that handles session overrides, while `lib/packages.ts` has `getPackagesFromSettings` that's simpler. They share overlapping logic but differ in session-override handling. Is the split intentional?

**Recommendation**: Consider merging or clarifying the relationship. `resolvePackageEntry` in `index.ts` does additional I/O (reads package.json) and session-override resolution that `getPackagesFromSettings` doesn't. Document why two resolvers exist and when to use each.

---

## Summary of Recommendations

1. **[Critical]** Add integration tests for `index.ts` — the `/packages` command handler, TUI component, session lifecycle, and filesystem I/O (currently 0% coverage on 661 lines)
2. **[Critical]** Resolve the `togglePackage` dead-code situation — either wire `index.ts` to use it (removing the inline duplicate) or delete it
3. **[High]** Add tests for `resolveDeclared` exclusion path (`-` prefix entries) and plain entries — entire code paths are untested
4. **[High]** Add `isNewerVersion` tests for versions with <3 segments and release-vs-pre-release comparisons
5. **[High]** Eliminate the `isAllResourcesEmpty`/`isFilterEnabled` duplication between `index.ts` and `lib/settings.ts`
6. **[Medium]** Add test for `togglePackage` with undefined `settings.packages`
7. **[Medium]** Add test for `resolveFilterEntry` with non-`npm:` prefixed sources (or add validation)
8. **[Low]** Add input validation to `parseVersion` for non-semver strings
9. **[Low]** Document the relationship between `resolvePackageEntry` (index.ts) and `getPackagesFromSettings` (lib/packages.ts)
