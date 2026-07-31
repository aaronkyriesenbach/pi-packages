import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['extensions/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['extensions/**/*.ts'],
      exclude: ['extensions/**/*.test.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
