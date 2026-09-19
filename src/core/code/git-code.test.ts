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

  it("коммиты основной ветки с размером: слияние целиком, без lock-файлов, документации и бинарных", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-01T10:00:00+03:00");
    const main = execFileSync("git", ["branch", "--show-current"], { cwd: repo, encoding: "utf8" }).trim();
    execFileSync("git", ["checkout", "-q", "-b", "feature"], { cwd: repo });
    await writeFiles(repo, { "src/b.ts": "1\n2\n3\n", "package-lock.json": "{\n}\n" });
    gitCommitAll(repo, "feature one", "2026-09-10T10:00:00+03:00");
    await writeFiles(repo, { "src/c.ts": "1\n", "logo.png": "\x00PNG\n", "docs/plan.md": "1\n2\n" });
    gitCommitAll(repo, "feature two", "2026-09-11T10:00:00+03:00");
    execFileSync("git", ["checkout", "-q", main], { cwd: repo });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "merge", "-q", "--no-ff", "-m", "merge feature", "feature"], {
      cwd: repo,
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-09-12T10:00:00+03:00", GIT_COMMITTER_DATE: "2026-09-12T10:00:00+03:00" },
    });

    const code = await readRepoCode(runGit, repo, new Date("2026-09-05T00:00:00+03:00"));

    expect(code?.units).toEqual([{ date: "2026-09-12T10:00:00+03:00", lines: 4 }]);
  });

  it("размер коммита исправления", async () => {
    const repo = await sampleRepo();

    const commit = await readFixCommit(runGit, repo, shortHead(repo));

    expect(commit?.lines).toBe(2);
  });

  it("строки тестов в коммите исправления считаются отдельно", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "one\n" });
    gitCommitAll(repo, "init", "2026-09-01T10:00:00+03:00");
    await writeFiles(repo, { "src/a.ts": "one\ntwo\nthree\n", "src/a.test.ts": "a\nb\nc\n" });
    gitCommitAll(repo, "fix: with test", "2026-09-10T10:00:00+03:00");

    const commit = await readFixCommit(runGit, repo, shortHead(repo));

    expect(commit).toMatchObject({ lines: 5, testLines: 3 });
  });

  it("коммит исправления меняет только lock-файл — берётся сам коммит, а не ближайший предок по пути", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "one\n" });
    gitCommitAll(repo, "init", "2026-09-01T10:00:00+03:00");
    await writeFiles(repo, { "package-lock.json": "{\n}\n" });
    gitCommitAll(repo, "fix: lockfile only", "2026-09-10T10:00:00+03:00");

    const commit = await readFixCommit(runGit, repo, shortHead(repo));

    expect(Date.parse(commit?.date ?? "")).toBe(Date.parse("2026-09-10T10:00:00+03:00"));
    expect(commit?.lines).toBe(0);
  });
});
