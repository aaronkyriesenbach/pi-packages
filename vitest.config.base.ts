import { defineConfig } from 'vitest/config';

// Strict, shared base for every package in this monorepo. A package's own
// vitest.config.ts imports this, merges it via mergeConfig, and appends only
// its own `test.include` and `coverage.include`/`coverage.exclude` (which
// must point at its own source files) plus any justified per-package deltas.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
