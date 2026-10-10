import { defineConfig } from "vitest/config";
import { ISOLATED_GIT_ENV } from "./src/core/store/testing/temp-dirs.ts";
import { PORT_GUARD_ENV, PORT_GUARD_SETUP } from "./tests/port-guard-config.ts";

export default defineConfig({
  test: {
    include: ["tests/package/**/*.e2e.ts"],
    testTimeout: 300_000,
    environment: "node",
    env: { ...ISOLATED_GIT_ENV, ...PORT_GUARD_ENV },
    setupFiles: [PORT_GUARD_SETUP],
  },
});
