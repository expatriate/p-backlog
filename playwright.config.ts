import { defineConfig } from "@playwright/test";
import { E2E_BACKLOG_DIR, E2E_PORT } from "./tests/e2e/backlog-dir";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://127.0.0.1:${E2E_PORT}` },
  webServer: {
    command: "npm run build && node dist/server.js",
    url: `http://127.0.0.1:${E2E_PORT}/api/projects`,
    env: { BACKLOG_DIR: E2E_BACKLOG_DIR, PORT: String(E2E_PORT) },
    timeout: 120_000,
  },
});
