import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const FIXTURE_TIME_ZONE = { TZ: "Europe/Moscow" };

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
        },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          include: ["src/web/**/*.test.ts", "src/web/**/*.test.tsx"],
          environment: "jsdom",
          env: FIXTURE_TIME_ZONE,
          setupFiles: ["src/web/testing/setup.ts"],
        },
      },
    ],
  },
});
