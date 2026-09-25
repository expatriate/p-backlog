import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../src/core/store/testing/temp-dirs";

const stopHook = join(import.meta.dirname, "../scripts/plugins/stop.mjs");
const isWindows = process.platform === "win32";

function envWithPath(path: string): NodeJS.ProcessEnv {
  const rest = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...rest, PATH: path };
}

async function fakeBacklogDir(): Promise<string> {
  const dir = await makeTempDir();
  const script = join(dir, "fake-backlog.mjs");
  await writeFile(script, 'let stdin = "";\nprocess.stdin.on("data", (chunk) => (stdin += chunk));\nprocess.stdin.on("end", () => console.log(JSON.stringify({ args: process.argv.slice(2), stdin })));\n');
  if (isWindows) await writeFile(join(dir, "backlog.cmd"), `@"${process.execPath}" "${script}" %*\r\n`);
  else await writeFile(join(dir, "backlog"), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`, { mode: 0o755 });
  return dir;
}

describe("хук плагина", () => {
  it("передаёт событие в backlog hook stop --agent claude и возвращает его ответ", async () => {
    const event = JSON.stringify({ cwd: "/repo", session_id: "s" });

    const result = spawnSync(process.execPath, [stopHook], { input: event, encoding: "utf8", env: envWithPath(await fakeBacklogDir()) });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ args: ["hook", "stop", "--agent", "claude"], stdin: event });
  });

  it("без backlog в PATH молча выходит с кодом 0", async () => {
    const result = spawnSync(process.execPath, [stopHook], { input: "{}", encoding: "utf8", env: envWithPath(await makeTempDir()) });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});
