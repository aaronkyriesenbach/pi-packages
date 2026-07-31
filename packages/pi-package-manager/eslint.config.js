import baseConfig from '../../eslint.config.js';
import globals from 'globals';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
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
  {
    ignores: ['dist/**'],
  },
];
