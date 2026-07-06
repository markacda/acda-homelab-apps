import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  {
    // Build output, data volumes and dependencies are never linted. atc's
    // src/js/** is vendored/browser JavaScript with no build pipeline, so it
    // stays excluded; the rest of atc (server/**) is now linted like every app.
    ignores: [
      "**/node_modules/**",
      "**/data/**",
      "**/dist/**",
      // Compiled browser bundles emitted from client/*.ts — lint the .ts source,
      // not the generated output.
      "apps/*/public/*.js",
      "apps/atc/src/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
    },
  },
  {
    // Server, shared libs and tests run on Node.
    files: [
      "apps/*/server.ts",
      "apps/atc/server/**/*.ts",
      "apps/*/lib/**/*.ts",
      "apps/*/test/**/*.ts",
      "*.config.js",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Everything under client/ compiles to public/ and runs in the browser.
    files: ["apps/*/client/**/*.ts"],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Turn off stylistic rules that conflict with Prettier.
  prettier,
];
