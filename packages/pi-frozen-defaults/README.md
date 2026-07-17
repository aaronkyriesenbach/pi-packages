# pi-frozen-defaults

A [pi](https://pi.dev) extension package that makes `defaultModel`,
`defaultProvider`, and `defaultThinkingLevel` behave as static configuration.

## Why

By default, pi writes `defaultModel`/`defaultProvider`/`defaultThinkingLevel`
to your global `settings.json` every time you switch models or thinking
levels (`/model`, `Ctrl+P`, `/thinking`), and reads them back as the starting
point for future sessions. That means switching models in one project quietly
changes the default for every other project.

This package freezes that persistence. With it installed:

- Switching your model or thinking level during a session only affects that
  session — it never gets written back to `settings.json`.
- `defaultModel`, `defaultProvider`, and `defaultThinkingLevel` only change
  when you edit `settings.json` yourself.
- Everything else is unaffected: startup model resolution still reads
  `defaultModel`/`defaultProvider`/`defaultThinkingLevel` normally, and
  `--model`/`--thinking` CLI flags work exactly as before.

See [`docs/adr/0001-freeze-defaults-via-prototype-patch.md`](./docs/adr/0001-freeze-defaults-via-prototype-patch.md)
for how and why this works.

## Install

```bash
pi install npm:@aaronkyriesenbach/pi-frozen-defaults
```

Or add it to `.pi/settings.json` / `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:@aaronkyriesenbach/pi-frozen-defaults"]
}
```

## Compatibility

This works by patching four private `SettingsManager` methods
(`setDefaultModel`, `setDefaultProvider`, `setDefaultModelAndProvider`,
`setDefaultThinkingLevel`) into no-ops at load time. It checks that all four
still exist before patching and throws a loud error if pi's internals have
changed in a way it can no longer safely handle — see the ADR linked above
for why that's an acceptable failure mode for this package.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run format:check
npm test
```
