import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
      coverage: {
        include: ['index.ts', 'lib/**/*.ts'],
        // types.ts is pure interface/type declarations — no executable
        // statements to cover.
        exclude: ['tests/**/*.ts', 'lib/types.ts'],
      },
    },
  }),
);
