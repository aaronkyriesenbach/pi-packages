# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — this repo is a multi-context Bun workspace monorepo (`pi-packages`); the map points at one `CONTEXT.md` per package. Read each one relevant to the topic.
- **`docs/adr/`** at the repo root — system-wide decisions. Also check `packages/<name>/docs/adr/` for package-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo (multi-context, presence of `CONTEXT-MAP.md` at the root — one context per package):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                                  ← system-wide decisions
└── packages/
    ├── pi-frozen-defaults/
    │   ├── CONTEXT.md
    │   └── docs/adr/                          ← package-scoped decisions
    └── <next-package>/
        ├── CONTEXT.md
        └── docs/adr/
```

Single-context repo (most other repos, for reference):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
