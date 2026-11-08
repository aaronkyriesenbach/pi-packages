import path from 'node:path';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

const packageConfig = (name, { globals: pkgGlobals = {}, rules = {} } = {}) => ({
  files: [`packages/${name}/**/*.ts`],
  languageOptions: {
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: path.join(import.meta.dirname, 'packages', name),
    },
    globals: pkgGlobals,
  },
  rules,
});

const noUndefOff = { 'no-undef': 'off' };

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
  packageConfig('pi-clean-comments', { rules: noUndefOff }),
  packageConfig('pi-package-manager', {
    globals: globals.node,
    rules: {
      ...noUndefOff,
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],
    },
  }),
  packageConfig('pi-substitute-commands'),
  eslintConfigPrettier,
  {
    ignores: ['vitest.config.base.ts', '**/node_modules/**', '**/coverage/**', '**/dist/**'],
  },
];
