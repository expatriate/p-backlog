import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const TESTS = ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/testing/**"];
const SOURCES = ["src/**/*.ts", "src/**/*.tsx"];
const WEB = ["src/web/**/*.ts", "src/web/**/*.tsx"];
const CATALOGS = ["src/**/messages.*.ts"];
const NODE_BUILTINS = { group: ["node:*"], message: "This layer is shared with the web UI; keep Node built-ins out of it." };
const ABOVE_MODEL = { group: ["**/store/**", "**/check/**", "**/stats/**"], message: "Model and journal sit below the store; pass what they need in as arguments." };
const ABOVE_STORE = { group: ["**/stats/**", "**/check/**"], message: "The store sits below stats and check; move the shared piece down to model or store." };
const HOST_PROCESS = ["env", "stdout", "stderr", "platform", "exit", "exitCode", "cwd"].map((property) => ({
  object: "process",
  property,
  message: "Read host facts in src/cli/main.ts or src/cli/host-env.ts and pass them in.",
}));
const onGlobalObjects = (property) => ["window", "globalThis", "self"].map((object) => ({ object, property }));
const BROWSER_WRAPPERS = [
  { file: "src/web/ui/use-stored-value.ts", globals: ["localStorage"], properties: [{ property: "localStorage" }], message: "Keep browser storage behind useStoredValue in ui/use-stored-value.ts." },
  { file: "src/web/ui/platform.ts", globals: [], properties: [{ property: "platform" }], message: "Ask isApplePlatform in ui/platform.ts." },
  { file: "src/web/ui/use-leave-guard.ts", globals: ["confirm"], properties: onGlobalObjects("confirm"), message: "Ask before leaving through useLeaveGuard in ui/use-leave-guard.ts." },
];
const NO_PROCESS_IN_BROWSER = { name: "process", message: "The web UI runs in the browser; it has no Node process." };
const browserFences = (wrappers) => ({
  "no-restricted-globals": ["error", NO_PROCESS_IN_BROWSER, ...wrappers.flatMap(({ globals, message }) => globals.map((name) => ({ name, message })))],
  "no-restricted-properties": ["error", ...wrappers.flatMap(({ properties, message }) => properties.map((restricted) => ({ ...restricted, message })))],
});
const REPORT_TYPES = { group: ["**/core/stats/types"], message: "Import report types from core/api/contract." };
const RECHARTS = { group: ["recharts"], message: "Draw charts through the wrappers in stats/charts." };
const LIST_PAGE = { group: ["**/list/**"], message: "Only the router mounts the list page; the task panel and the shared app, ui and api modules must not depend on it. Move the shared piece to ui/ or app/." };
const webImports = (...patterns) => ({ "no-restricted-imports": ["error", { patterns: [REPORT_TYPES, ...patterns] }] });
const REVERSE_IN_PLACE = { selector: "CallExpression[callee.property.name='reverse'][arguments.length=0]", message: "reverse() mutates the array; use toReversed()." };
const ERROR_SWALLOWING_HANDLERS = [
  "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[params.length=0][body.type='Literal']",
  "CallExpression[callee.property.name='then'] > ArrowFunctionExpression:nth-child(2)[params.length=0]:not([body.type='BlockStatement'])",
];
const swallowedErrors = (message) => ERROR_SWALLOWING_HANDLERS.map((selector) => ({ selector, message }));
const NODE_SWALLOWED_ERRORS = swallowedErrors("Swallows every error as a missing file; use readTextOrNull, fileExists, statOrNull or another fs-utils helper.");
const BROWSER_SWALLOWED_ERRORS = swallowedErrors("Swallows every error as a fallback value; handle the failure you expect and let the rest surface.");

export default tseslint.config(
  { ignores: [".claude", "dist", "node_modules", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: globals.node },
    rules: {
      "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
      "no-restricted-syntax": ["error", REVERSE_IN_PLACE, ...NODE_SWALLOWED_ERRORS],
    },
  },
  {
    files: [...SOURCES, "tests/**/*.ts"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: SOURCES,
    ignores: ["src/cli/main.ts", "src/cli/host-env.ts", ...TESTS],
    rules: { "no-restricted-properties": ["error", ...HOST_PROCESS] },
  },
  {
    files: SOURCES,
    ignores: [...TESTS, ...CATALOGS],
    rules: { "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }] },
  },
  {
    files: CATALOGS,
    ignores: TESTS,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^(?!.*/core/i18n/)", allowTypeImports: true, message: "A catalog holds text; take formatting helpers from core/i18n and only types from elsewhere." }] },
      ],
    },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: { "no-console": "error" },
  },
  {
    files: ["src/core/stats/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [NODE_BUILTINS] }] },
  },
  {
    files: ["src/core/model/**/*.ts", "src/core/journal/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [NODE_BUILTINS, ABOVE_MODEL] }] },
  },
  {
    files: ["src/core/store/**/*.ts"],
    ignores: TESTS,
    rules: { "no-restricted-imports": ["error", { patterns: [ABOVE_STORE] }] },
  },
  {
    files: ["src/core/messages/en.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ regex: "(^|/)ru(\\.ts)?$", message: "Take the catalog type from ./types." }] }] },
  },
  {
    files: ["src/core/stats/**/*.ts", "src/core/i18n/**/*.ts"],
    ignores: TESTS,
    rules: {
      "@typescript-eslint/no-magic-numbers": [
        "error",
        { ignore: [0, 1, -1, 2], ignoreArrayIndexes: true, ignoreDefaultValues: true, ignoreEnums: true, ignoreNumericLiteralTypes: true, ignoreReadonlyClassProperties: true, ignoreTypeIndexes: true },
      ],
    },
  },
  {
    files: WEB,
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      ...webImports(RECHARTS),
      "@typescript-eslint/no-unnecessary-condition": "error",
      "no-restricted-syntax": ["error", REVERSE_IN_PLACE, ...BROWSER_SWALLOWED_ERRORS],
    },
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["src/web/stats/charts/**"],
    rules: webImports(),
  },
  {
    files: ["src/web/task/**", "src/web/app/**", "src/web/ui/**", "src/web/api/**"],
    ignores: ["src/web/app/App.tsx"],
    rules: webImports(RECHARTS, LIST_PAGE),
  },
  {
    files: WEB,
    ignores: TESTS,
    rules: browserFences(BROWSER_WRAPPERS),
  },
  ...BROWSER_WRAPPERS.map((wrapper) => ({
    files: [wrapper.file],
    rules: browserFences(BROWSER_WRAPPERS.filter((other) => other !== wrapper)),
  })),
);
