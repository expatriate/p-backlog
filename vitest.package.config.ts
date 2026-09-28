import { defineConfig } from "vitest/config";
import { ISOLATED_GIT_ENV } from "./src/core/store/testing/temp-dirs.ts";

export default defineConfig({
  test: {
    include: ["tests/package/**/*.e2e.ts"],
    testTimeout: 300_000,
    environment: "node",
    env: ISOLATED_GIT_ENV,
  },
});
