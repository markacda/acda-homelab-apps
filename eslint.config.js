import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    // Build output, data volumes and dependencies are never linted. atc's
    // Web/public is vendored/browser JavaScript + assets with no build pipeline,
    // so it stays excluded; the rest of atc (server.ts + the DDD layers) is
    // linted like every app.
    ignores: [
      '**/node_modules/**',
      '**/data/**',
      '**/dist/**',
      // Compiled browser bundles emitted from Web/client/*.ts — lint the .ts
      // source, not the generated output.
      'apps/*/Web/public/*.js',
      'apps/atc/Web/public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
  },
  {
    // Server, shared libs and tests run on Node.
    files: [
      'apps/*/server.ts',
      // The DDD layers (see ARCHITECTURE.md).
      'apps/*/Domain/**/*.ts',
      'apps/*/Application/**/*.ts',
      'apps/*/Adapters/**/*.ts',
      'apps/*/Ports/**/*.ts',
      'apps/*/Models/**/*.ts',
      'apps/*/test/**/*.ts',
      'apps/Common/*/**/*.ts',
      '*.config.js',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Browser code under Web/client compiles to Web/public/.
    files: ['apps/*/Web/client/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Honour the repo-wide `_`-prefix convention for intentionally-unused
    // bindings — e.g. `(_req, res)` handlers and the required-but-unused `_next`
    // 4th arg of an Express error handler (Express detects them by arity).
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Turn off stylistic rules that conflict with Prettier.
  prettier,
];
