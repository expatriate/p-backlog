import { spawnSync } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../src/core/store/testing/temp-dirs";

const repoRoot = join(import.meta.dirname, "..");
const script = join(repoRoot, "scripts/install-skill.mjs");
const STOP_HOOK_COMMAND = "command -v backlog >/dev/null && backlog hook stop || true";

async function sandbox() {
  const dir = await makeTempDir();
  const skillsDir = join(dir, "skills");
  const settingsPath = join(dir, "claude/settings.json");
  const env = { ...process.env, CLAUDE_SKILLS_DIR: skillsDir, CLAUDE_SETTINGS_PATH: settingsPath };
  return { skillsDir, settingsPath, run: () => spawnSync("node", [script], { env, encoding: "utf8" }) };
}

describe("install-skill", () => {
  it("создаёт симлинк, повторный запуск ничего не ломает, чужой каталог не трогает", async () => {
    const { skillsDir, run } = await sandbox();

    expect(run().status).toBe(0);
    expect(await realpath(join(skillsDir, "backlog"))).toBe(await realpath(join(repoRoot, "skill/backlog")));
    expect(run().stdout).toContain("уже установлен");

    const other = await sandbox();
    await mkdir(join(other.skillsDir, "backlog"), { recursive: true });
    expect(other.run().status).toBe(1);
  });

  it("добавляет хук Stop один раз и сохраняет остальные настройки", async () => {
    const { settingsPath, run } = await sandbox();
    const foreignHook = { hooks: [{ type: "command", command: "say готово" }] };
    await mkdir(join(settingsPath, ".."), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ model: "opus", hooks: { Stop: [foreignHook] } }));

    expect(run().status).toBe(0);
    expect(run().stdout).toContain("Хук Stop уже есть");

    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(settings).toEqual({
      model: "opus",
      hooks: { Stop: [foreignHook, { hooks: [{ type: "command", command: STOP_HOOK_COMMAND }] }] },
    });
  });

  it("не трогает настройки, которые не разобрать", async () => {
    const { settingsPath, run } = await sandbox();
    await mkdir(join(settingsPath, ".."), { recursive: true });
    await writeFile(settingsPath, "{ сломано");

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("не объект JSON");
    expect(await readFile(settingsPath, "utf8")).toBe("{ сломано");
  });
});
