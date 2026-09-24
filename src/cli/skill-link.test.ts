import { mkdir, realpath, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeFiles } from "../core/store/testing/temp-dirs";
import { linkSkillFor } from "./skill-link";

describe("ссылка на скилл backlog", () => {
  it("ссылку на скилл другой копии p-backlog переставляет на текущую, каталог не-p-backlog не трогает", async () => {
    const dir = await makeTempDir();
    const oldCopy = join(dir, "old-clone");
    const current = join(dir, "pkg");
    for (const root of [oldCopy, current]) {
      await writeFiles(root, { "package.json": JSON.stringify({ name: "p-backlog" }), "skill/backlog/SKILL.md": "ru", "skill/backlog-en/SKILL.md": "en" });
    }
    const skillsDir = join(dir, "skills");
    await mkdir(skillsDir, { recursive: true });
    await symlink(join(oldCopy, "skill/backlog"), join(skillsDir, "backlog"), "dir");

    expect(await linkSkillFor("ru", { skillsDir, repoRoot: current, platform: process.platform })).toBe("linked");
    expect(await realpath(join(skillsDir, "backlog"))).toBe(await realpath(join(current, "skill/backlog")));

    const stranger = join(dir, "stranger/skill/backlog");
    await writeFiles(join(dir, "stranger"), { "package.json": JSON.stringify({ name: "other" }), "skill/backlog/SKILL.md": "x" });
    await unlink(join(skillsDir, "backlog"));
    await symlink(stranger, join(skillsDir, "backlog"), "dir");
    expect(await linkSkillFor("ru", { skillsDir, repoRoot: current, platform: process.platform })).toBe("foreign");
  });
});
