import { lstat, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
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
});
