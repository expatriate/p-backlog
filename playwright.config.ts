import { defineConfig } from "@playwright/test";
import { E2E_BACKLOG_DIR, E2E_HOME, E2E_PORT } from "./tests/e2e/backlog-dir";
import { isolatedHomeEnv } from "./tests/isolated-process";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: `http://127.0.0.1:${E2E_PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    // the projects share one server and backlog directory, so a run without --project must not overlap them
    { name: "webkit", use: { browserName: "webkit" }, dependencies: ["chromium"] },
  ],
  webServer: {
    command: "npm run build && node dist/cli.js serve",
    url: `http://127.0.0.1:${E2E_PORT}/api/projects`,
    env: { ...isolatedHomeEnv(E2E_HOME), BACKLOG_DIR: E2E_BACKLOG_DIR, PORT: String(E2E_PORT) },
    timeout: 120_000,
  },
});
