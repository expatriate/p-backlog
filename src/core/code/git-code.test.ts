import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitCommitAll, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { readFixCommit, readHead, readRepoCode, runGit } from "./git-code";

const AGENT_MESSAGE = "fix: retry\n\nCo-authored-by: claude Sonnet 5 <noreply@anthropic.com>";

async function sampleRepo(): Promise<string> {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/a.ts": "one\ntwo\n", "package-lock.json": "{\n}\n", "web/package-lock.json": "{\n}\n" });
  gitCommitAll(repo, "init", "2026-09-01T10:00:00+03:00");
  await writeFiles(repo, { "src/a.ts": "one\ntwo\nthree\n", "src/b.ts": "b\n" });
  gitCommitAll(repo, AGENT_MESSAGE, "2026-09-10T10:00:00+03:00");
  return repo;
}

const shortHead = (repo: string) => execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

describe("чтение git для вкладки «Код»", () => {
  it("коммиты с файлами за период и строки без lock-файлов", async () => {
    const repo = await sampleRepo();

    const code = await readRepoCode(runGit, repo, new Date("2026-09-05T00:00:00+03:00"));

    expect(code?.commits).toEqual([["src/a.ts", "src/b.ts"]]);
    expect(code?.lines).toEqual([
      { path: "src/a.ts", lines: 3 },
      { path: "src/b.ts", lines: 1 },
    ]);
  });

  it("коммит исправления: дата и агент по трейлеру без учёта регистра, неизвестный хеш — null", async () => {
    const repo = await sampleRepo();

    const commit = await readFixCommit(runGit, repo, shortHead(repo));

    expect(commit?.byAgent).toBe(true);
    expect(Date.parse(commit?.date ?? "")).toBe(Date.parse("2026-09-10T10:00:00+03:00"));
    expect(await readFixCommit(runGit, repo, "deadbee")).toBeNull();
  });

  it("репозиторий — поддиректория: пути коммитов и строк относительны ей", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "pkg/src/a.ts": "a\n", "other/b.ts": "b\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");

    const code = await readRepoCode(runGit, join(repo, "pkg"), new Date("2026-09-05T00:00:00+03:00"));

    expect(code?.commits).toEqual([["src/a.ts"]]);
    expect(code?.lines.every(({ path }) => path.startsWith("src/"))).toBe(true);
  });

  it("путь с кавычкой не теряется в строках и коммитах", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { 'src/we"ird.ts': "x\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");

    const code = await readRepoCode(runGit, repo, new Date("2026-09-05T00:00:00+03:00"));

    expect(code?.commits).toEqual([['src/we"ird.ts']]);
    expect(code?.lines).toEqual([{ path: 'src/we"ird.ts', lines: 1 }]);
  });

  it("не git — HEAD нет и данных нет", async () => {
    const dir = await makeTempDir();

    expect(await readHead(runGit, dir)).toBeNull();
    expect(await readRepoCode(runGit, dir, new Date("2026-09-05T00:00:00+03:00"))).toBeNull();
  });
});
