import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Main process and tooling: plain Node, ESM unless named .cjs.
    files: ["electron/**/*.js", "scripts/**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      // IPC and event handlers keep their full signature for readability.
      "no-unused-vars": ["error", { args: "none", ignoreRestSiblings: true }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // These run snippets inside the page via CDP, so they use browser globals.
    files: [
      "scripts/capture-setup.js",
      "scripts/e2e/run.mjs",
      "scripts/qa/app.mjs",
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["scripts/**/*.cjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
]);
