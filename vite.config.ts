import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: { proxy: { "/api": { target: "http://127.0.0.1:4317", changeOrigin: true } } },
});
