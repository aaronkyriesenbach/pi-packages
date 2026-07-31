# Context Map

`pi-packages` is a Bun-workspace monorepo. Each package under `packages/*` is
its own bounded context with its own `CONTEXT.md` and, where relevant, its
own `docs/adr/`. There are no relationships between packages — each one is
an independent `pi` extension/package published on its own, and nothing in
this repo should introduce cross-package imports or shared runtime
behavior. Shared root-level config (TypeScript, ESLint, Prettier, CI) is a
build-time/tooling concern only, not a domain relationship.

## Contexts

- **`packages/pi-frozen-defaults`** — see
  [`packages/pi-frozen-defaults/CONTEXT.md`](packages/pi-frozen-defaults/CONTEXT.md)
  and
  [`packages/pi-frozen-defaults/docs/adr/`](packages/pi-frozen-defaults/docs/adr/).
