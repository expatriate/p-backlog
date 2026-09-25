import { lstat, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

const repoRoot = join(import.meta.dirname, "../../..");

describe("backlog config language", () => {
  it("показывает, меняет и отвергает неизвестный язык", async () => {
    const { run } = await makeCliSandbox();
    expect((await run(["config", "language"])).out).toBe("ru");
    expect(await run(["config", "language", "en"])).toMatchObject({ code: EXIT.ok });
    expect((await run(["config", "language"])).out).toBe("en");
    expect((await run(["config", "language", "de"])).code).toBe(EXIT.invalid);
  });

  it("переставляет ссылку скилла на вариант нужного языка", async () => {
    const { home, run } = await makeCliSandbox();
    const skillsDir = join(home, "skills");
    const env = { CLAUDE_SKILLS_DIR: skillsDir };

    expect((await run(["config", "language", "en"], { env })).code).toBe(EXIT.ok);
    expect(await realpath(join(skillsDir, "backlog"))).toBe(await realpath(join(repoRoot, "skill/backlog-en")));

    expect((await run(["config", "language", "ru"], { env })).code).toBe(EXIT.ok);
    expect(await realpath(join(skillsDir, "backlog"))).toBe(await realpath(join(repoRoot, "skill/backlog")));
  });

  it("чужой каталог не трогает, но язык меняет и предупреждает", async () => {
    const { home, run } = await makeCliSandbox();
    const skillsDir = join(home, "skills");
    await mkdir(join(skillsDir, "backlog"), { recursive: true });

    const result = await run(["config", "language", "en"], { env: { CLAUDE_SKILLS_DIR: skillsDir } });

    expect(result.code).toBe(EXIT.ok);
    expect(result.err).toContain("foreign directory");
    expect((await lstat(join(skillsDir, "backlog"))).isSymbolicLink()).toBe(false);
  });

  it("у Codex и Cursor переставляет только уже стоящую нашу ссылку, новую не заводит", async () => {
    const withLink = await makeCliSandbox();
    const codexLink = join(withLink.home, ".agents/skills/backlog");
    await mkdir(join(withLink.home, ".codex"), { recursive: true });
    await mkdir(dirname(codexLink), { recursive: true });
    await symlink(join(repoRoot, "skill/backlog"), codexLink, "dir");
    const withoutLink = await makeCliSandbox();
    await mkdir(join(withoutLink.home, ".cursor"), { recursive: true });

    expect((await withLink.run(["config", "language", "en"])).code).toBe(EXIT.ok);
    expect((await withoutLink.run(["config", "language", "en"])).code).toBe(EXIT.ok);

    expect(await realpath(codexLink)).toBe(await realpath(join(repoRoot, "skill/backlog-en")));
    await expect(lstat(join(withoutLink.home, ".agents/skills/backlog"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("сбой ссылки у одного агента не мешает переставить скилл остальным", async () => {
    const { home, run } = await makeCliSandbox();
    const codexLink = join(home, ".agents/skills/backlog");
    await writeFile(join(home, "not-a-dir"), "");
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(dirname(codexLink), { recursive: true });
    await symlink(join(repoRoot, "skill/backlog"), codexLink, "dir");

    const result = await run(["config", "language", "en"], { env: { CLAUDE_SKILLS_DIR: join(home, "not-a-dir/skills") } });

    expect(result.code).toBe(EXIT.ok);
    expect(result.err).toMatch(/^Claude Code: /m);
    expect(await realpath(codexLink)).toBe(await realpath(join(repoRoot, "skill/backlog-en")));
  });

  it("при включённом плагине скилл Claude Code не трогает и подсказывает плагин нужного языка", async () => {
    const { home, run } = await makeCliSandbox();
    const settingsPath = join(home, ".claude/settings.json");
    await mkdir(dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ enabledPlugins: { "p-backlog-ru@p-backlog": true } }));

    const result = await run(["config", "language", "en"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("/plugin install p-backlog@p-backlog");
    await expect(lstat(join(home, ".claude/skills/backlog"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
