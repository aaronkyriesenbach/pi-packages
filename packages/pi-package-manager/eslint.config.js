import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
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
      // Test doubles legitimately need deliberate empty-body stubs (e.g. a
      // no-op `notify`/`sendReload` dependency); allow that instead of
      // reaching for a per-line suppression comment. Mirrors
      // pi-frozen-defaults' own justified override for the same rule.
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],
      // TS-only ambient globals (e.g. the `NodeJS` namespace) aren't visible
      // to core ESLint's no-undef, and tsc (already run in CI via typecheck)
      // is authoritative for real undefined-identifier errors anyway — this
      // is typescript-eslint's own documented recommendation:
      // https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-am-using-a-rule-from-eslint-core-and-it-doesnt-work-correctly-with-typescript
      'no-undef': 'off',
    },
  },
  eslintConfigPrettier,
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**'],
  },
];
