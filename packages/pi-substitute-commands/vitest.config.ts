import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
      coverage: {
        include: ['extensions/**/*.ts'],
        exclude: ['tests/**/*.ts'],
      },
    },
  }),
);
