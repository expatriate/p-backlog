import { chmod } from "node:fs/promises";
import { build } from "esbuild";

const outfile = process.argv[2] ?? "dist/cli.js";

await build({
  entryPoints: ["src/cli/main.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "warning",
});
await chmod(outfile, 0o755);
