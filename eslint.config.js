import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';

// Strict, shared base for every package in this monorepo. A package's own
// eslint.config.js imports this array, spreads it, and appends only the
// `languageOptions.parserOptions.project` block (which must point at its own
// tsconfig.json) plus any justified per-package rule deltas.
export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs['strict-type-checked'].rules,
      ...tseslint.configs['stylistic-type-checked'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
    },
  },
  eslintConfigPrettier,
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
];
