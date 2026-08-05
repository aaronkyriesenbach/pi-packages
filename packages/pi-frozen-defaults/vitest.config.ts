import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['extensions/**/*.test.ts'],
      coverage: {
        include: ['extensions/**/*.ts'],
        exclude: ['extensions/**/*.test.ts'],
      },
    },
  }),
);
