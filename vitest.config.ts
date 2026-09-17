import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["src/core/**/*.test.ts", "src/cli/**/*.test.ts", "src/server/**/*.test.ts", "tests/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          include: ["src/web/**/*.test.ts", "src/web/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["src/web/testing/setup.ts"],
        },
      },
    ],
  },
});
