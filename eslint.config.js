'use strict';

const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  { ignores: ['dist/', 'node_modules/', 'portal/', 'serve/', 'coverage/'] },
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-throw-literal': 'error',
      curly: ['error', 'multi-line'],
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },
  {
    files: ['src/utils/logger.js'],
    rules: { 'no-console': 'off' }
  },
  {
    files: ['src/runtime/**', 'src/cli.js', 'src/builders/**', 'src/compiler/**'],
    rules: { 'no-console': 'off' }
  },
  {
    files: ['src/runtime/**'],
    languageOptions: {
      globals: { ...globals.browser }
    },
    rules: {
      'no-var': 'off',
      'prefer-const': 'off'
    }
  }
];
