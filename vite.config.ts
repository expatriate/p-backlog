import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readPort } from "./src/server/port";

const FRONTEND_MODULE = /\.(?:ts|tsx|js|jsx|css)(?:\?|$)/;

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${readPort(process.env.PORT)}`,
        changeOrigin: true,
        bypass: (request) => (FRONTEND_MODULE.test(request.url ?? "") ? request.url : undefined),
      },
    },
  },
});
