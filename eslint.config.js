import js from '@eslint/js';
import globals from 'globals';

const workletGlobals = {
  AudioWorkletProcessor: 'readonly',
  registerProcessor: 'readonly',
  sampleRate: 'readonly',
  currentFrame: 'readonly',
  currentTime: 'readonly',
};

export default [
  js.configs.recommended,
  {
    files: ['src/worklets/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: workletGlobals,
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          args: 'none',
          caughtErrors: 'none',
          varsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'off',
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          args: 'none',
          caughtErrors: 'none',
          varsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', '*.log', '.claude/**'],
  },
];
