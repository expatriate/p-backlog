import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Node 22 omits node:sqlite from builtinModules, so vitest would hand it to Vite to bundle for jsdom.
const nodeBuiltinsStayExternal: Plugin = {
  name: "node-builtins-stay-external",
  enforce: "pre",
  resolveId: (id) => (id.startsWith("node:") ? { id, external: true } : null),
};

const FIXTURE_TIME_ZONE = { TZ: "Europe/Moscow" };
const LONGER_TIMEOUT_ON_WINDOWS = process.platform === "win32" ? { testTimeout: 20_000 } : {};

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/testing/**", "src/web/main.tsx", "src/server/main.ts", "src/cli/main.ts"],
      reporter: ["text-summary", "text"],
    },
    projects: [
      {
        test: {
          name: "node",
          include: ["src/core/**/*.test.ts", "src/cli/**/*.test.ts", "src/server/**/*.test.ts", "tests/**/*.test.ts"],
          environment: "node",
          env: FIXTURE_TIME_ZONE,
          ...LONGER_TIMEOUT_ON_WINDOWS,
        },
      },
      {
        plugins: [react(), nodeBuiltinsStayExternal],
        test: {
          name: "web",
          include: ["src/web/**/*.test.ts", "src/web/**/*.test.tsx"],
          environment: "jsdom",
          env: FIXTURE_TIME_ZONE,
          setupFiles: ["src/web/testing/setup.ts"],
          ...LONGER_TIMEOUT_ON_WINDOWS,
        },
      },
    ],
  },
});
