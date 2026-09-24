import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/package/**/*.e2e.ts"],
    testTimeout: 300_000,
    environment: "node",
  },
});
