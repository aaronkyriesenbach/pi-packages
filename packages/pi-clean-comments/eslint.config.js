import baseConfig from '../../eslint.config.js';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // TS-only ambient globals (e.g. the `NodeJS` namespace) aren't visible
      // to core ESLint's no-undef, and tsc (already run in CI via typecheck)
      // is authoritative for real undefined-identifier errors anyway — this
      // is typescript-eslint's own documented recommendation, mirrored from
      // pi-package-manager's own justified override for the same rule:
      // https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-am-using-a-rule-from-eslint-core-and-it-doesnt-work-correctly-with-typescript
      'no-undef': 'off',
    },
  },
];
