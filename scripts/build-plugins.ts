import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pluginFiles } from "./plugins/plugin-files";

const repoRoot = join(import.meta.dirname, "..");

for (const [path, content] of Object.entries(await pluginFiles(repoRoot))) {
  await mkdir(dirname(join(repoRoot, path)), { recursive: true });
  await writeFile(join(repoRoot, path), content);
}
