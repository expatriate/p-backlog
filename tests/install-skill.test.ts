import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../src/core/store/testing/temp-dirs";

const repoRoot = join(import.meta.dirname, "..");
const script = join(repoRoot, "scripts/install-skill.mjs");

describe("install-skill", () => {
  it("создаёт симлинк, повторный запуск ничего не ломает, чужой каталог не трогает", async () => {
    const skillsDir = join(await makeTempDir(), "skills");
    const env = { ...process.env, CLAUDE_SKILLS_DIR: skillsDir };

    execFileSync("node", [script], { env });
    expect(await realpath(join(skillsDir, "backlog"))).toBe(await realpath(join(repoRoot, "skill/backlog")));
    expect(spawnSync("node", [script], { env, encoding: "utf8" }).stdout).toContain("уже установлен");

    const otherDir = join(await makeTempDir(), "skills");
    await mkdir(join(otherDir, "backlog"), { recursive: true });
    const conflict = spawnSync("node", [script], { env: { ...process.env, CLAUDE_SKILLS_DIR: otherDir }, encoding: "utf8" });
    expect(conflict.status).toBe(1);
  });
});
