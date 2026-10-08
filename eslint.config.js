import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".claude", "dist", "node_modules", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { languageOptions: { globals: globals.node }, rules: { "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }] } },
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: { "@typescript-eslint/no-floating-promises": "error", "@typescript-eslint/no-misused-promises": "error" },
  },
  {
    files: ["src/core/model/**/*.ts", "src/core/journal/**/*.ts", "src/core/stats/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: ["node:*"] }] },
  },
  {
    files: ["src/core/store/**/*.ts"],
    ignores: ["src/core/store/**/*.test.ts", "src/core/store/testing/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["**/stats/**", "**/check/**"], message: "The store sits below stats and check; move the shared piece down to model or store." }] }] },
  },
  {
    files: ["src/web/**/*.ts", "src/web/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/core/stats/types"], message: "Import report types from core/api/contract." }] }],
    },
    languageOptions: { globals: globals.browser },
  },
);
