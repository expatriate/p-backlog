import react from "@vitejs/plugin-react";
import { builtinModules } from "node:module";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import { loopbackOrigin, requestedPort } from "./src/server/port";

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

function apiProxy(): ProxyOptions {
  const port = requestedPort(process.env.PORT);
  if (port === null) throw new Error(`PORT is not a valid port number: "${process.env.PORT}"`);
  return { target: loopbackOrigin(port), changeOrigin: true, bypass: (request) => (FRONTEND_MODULE.test(request.url ?? "") ? request.url : undefined) };
}

export default defineConfig(({ command }) => ({
  root: "src/web",
  plugins: [react(), browserOnly],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: command === "serve" ? { proxy: { "/api": apiProxy() } } : {},
}));
