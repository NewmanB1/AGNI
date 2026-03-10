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
    files: ['packages/agni-utils/logger.js'],
    rules: { 'no-console': 'off' }
  },
  {
    files: ['packages/agni-cli/**/*.js'],
    rules: { 'no-console': 'off' }
  },
  {
    files: ['packages/agni-runtime/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        LESSON_DATA: 'readonly',
        QRious: 'readonly'
      }
    },
    rules: {
      'no-var': 'off',
      'prefer-const': 'off',
      'no-console': 'off',
      'no-prototype-builtins': 'off',
      'no-redeclare': 'off',
      'no-control-regex': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-undef': 'off',
      'no-useless-assignment': 'off'
    }
  },
  {
    files: ['packages/agni-hub/pwa/**', 'packages/agni-hub/sw.js'],
    languageOptions: {
      globals: { ...globals.browser, self: 'readonly', LESSON_DATA: 'readonly' }
    },
    rules: {
      'no-var': 'off',
      'prefer-const': 'off',
      'no-control-regex': 'off',
      'no-undef': 'off'
    }
  },
  {
    files: ['packages/agni-hub/sw.js'],
    rules: {
      // no-undef:off prevents ref-tracking; MAX_LESSON_CACHE_ENTRIES is used (lessonLimit = ...).
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^MAX_LESSON_CACHE_ENTRIES$' }]
    }
  }
];
