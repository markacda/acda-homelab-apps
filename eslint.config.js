import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: ["**/node_modules/**", "**/data/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
    },
  },
  {
    // Server, shared libs and tests run on Node.
    files: ["apps/*/server.js", "apps/*/lib/**/*.js", "apps/*/test/**/*.js", "*.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Everything under public/ runs in the browser.
    files: ["apps/*/public/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Turn off stylistic rules that conflict with Prettier.
  prettier,
];
