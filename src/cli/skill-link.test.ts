import { lstat, mkdir, realpath, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeFiles } from "../core/store/testing/temp-dirs";
import { linkSkillFor, unlinkOurSkill } from "./skill-link";

const repoRoot = join(import.meta.dirname, "../..");

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

    expect(await linkSkillFor("ru", { skillsDir, packageRoot: current, platform: process.platform })).toBe("linked");
    expect(await realpath(join(skillsDir, "backlog"))).toBe(await realpath(join(current, "skill/backlog")));

    const stranger = join(dir, "stranger/skill/backlog");
    await writeFiles(join(dir, "stranger"), { "package.json": JSON.stringify({ name: "other" }), "skill/backlog/SKILL.md": "x" });
    await unlink(join(skillsDir, "backlog"));
    await symlink(stranger, join(skillsDir, "backlog"), "dir");
    expect(await linkSkillFor("ru", { skillsDir, packageRoot: current, platform: process.platform })).toBe("foreign");
  });

  it("ссылку на удалённую копию p-backlog (клон стёрт целиком, package.json не прочитать) считает своей и переставляет", async () => {
    const dir = await makeTempDir();
    const current = join(dir, "pkg");
    await writeFiles(current, { "package.json": JSON.stringify({ name: "p-backlog" }), "skill/backlog/SKILL.md": "ru" });
    const skillsDir = join(dir, "skills");
    await mkdir(skillsDir, { recursive: true });
    await symlink(join(dir, "deleted-clone/skill/backlog"), join(skillsDir, "backlog"), "dir");

    expect(await linkSkillFor("ru", { skillsDir, packageRoot: current, platform: process.platform })).toBe("linked");
    expect(await realpath(join(skillsDir, "backlog"))).toBe(await realpath(join(current, "skill/backlog")));
  });
});

describe("unlinkOurSkill", () => {
  it("снимает свою ссылку, чужой каталог не трогает", async () => {
    const home = await makeTempDir();
    const ours = join(home, "ours");
    await linkSkillFor("ru", { skillsDir: ours, packageRoot: repoRoot, platform: process.platform });
    const theirs = join(home, "theirs");
    await mkdir(join(theirs, "backlog"), { recursive: true });

    expect(await unlinkOurSkill(ours)).toBe("removed");
    expect(await lstat(join(ours, "backlog")).catch(() => null)).toBeNull();
    expect(await unlinkOurSkill(ours)).toBe("absent");
    expect(await unlinkOurSkill(theirs)).toBe("foreign");
    expect((await lstat(join(theirs, "backlog"))).isDirectory()).toBe(true);
  });
});
