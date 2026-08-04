import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // haven/ is an unrelated project with its own toolchain
    ignores: [
      'haven/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.next/**',
      '**/next-env.d.ts',
      // Runs inside the k6 runtime (k6/* modules, __ENV/__VU globals).
      'tests/src/load/k6-profiles.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // The service worker ships to phones, so it is linted like any other
    // source — it just runs in the worker global scope, not Node's.
    files: ['apps/web/public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    // Build-time Node scripts (icon generation).
    files: ['**/scripts/*.mjs'],
    languageOptions: {
      globals: { Buffer: 'readonly', console: 'readonly', process: 'readonly' },
    },
  },
  {
    rules: {
      // Underscore prefix marks intentionally unused (mock adapter params).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
