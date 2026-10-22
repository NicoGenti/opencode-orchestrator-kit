// Flat ESLint configuration for the standalone static landing page.
// Generated `site/` is excluded; destination Markdown docs under `docs/`
// are out of scope for this configuration.

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["site/**", "dist/**", "node_modules/**"],
  },
  {
    files: ["docs-src/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ["vite.docs.config.ts", "scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Plugin sources run under Bun and Node (no DOM): Node/Bun builtins only.
    // globals@15.11 does not ship a bun environment, so Node globals cover the
    // surface the plugin actually uses.
    files: ["plugin/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
    },
  },
);
