import { spawnSync } from "node:child_process";
import { join } from "node:path";

export function runCheckScript(name: string, cwd: string) {
  return spawnSync("node", [join(import.meta.dirname, "../scripts", name)], { cwd, encoding: "utf8" });
}
