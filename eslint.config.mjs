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
    rules: {
      // Underscore prefix marks intentionally unused (mock adapter params).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
