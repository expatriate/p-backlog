import react from "@vitejs/plugin-react";
import { builtinModules } from "node:module";
import { defineConfig, type Plugin } from "vite";
import { readPort } from "./src/server/port";

const FRONTEND_MODULE = /\.(?:ts|tsx|js|jsx|css)(?:\?|$)/;
const NODE_BUILTINS = new Set(builtinModules);

const browserOnly: Plugin = {
  name: "browser-only",
  apply: "build",
  enforce: "pre",
  resolveId(id, importer) {
    if (id.startsWith("node:") || NODE_BUILTINS.has(id)) this.error(`${id} is a Node module and cannot run in the browser (imported by ${importer ?? "entry"})`);
  },
};

export default defineConfig({
  root: "src/web",
  plugins: [react(), browserOnly],
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
