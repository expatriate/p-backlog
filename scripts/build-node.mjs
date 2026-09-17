import { chmod } from "node:fs/promises";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const { values } = parseArgs({ options: { outdir: { type: "string", default: "dist" } } });

await build({
  entryPoints: { cli: "src/cli/main.ts", server: "src/server/main.ts" },
  outdir: values.outdir,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "warning",
});
await chmod(`${values.outdir}/cli.js`, 0o755);
