import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { languageOptions: { globals: globals.node } },
  {
    files: ["src/core/model/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: ["node:*"] }] },
  },
  {
    files: ["src/web/**/*.ts", "src/web/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
    languageOptions: { globals: globals.browser },
  },
);
