import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitCheckout, gitCommitAll, gitMergeNoFastForward, gitMergeSquash, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { readFixCommits, readRefs, readRepoCode } from "./git-code";
import { runGit, type GitRunner } from "../git/run";
import { countingGit } from "../git/testing/counting-git";

const AGENT_MESSAGE = "fix: retry\n\nCo-authored-by: claude Sonnet 5 <noreply@anthropic.com>";

async function sampleRepo(): Promise<string> {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/a.ts": "one\ntwo\n", "package-lock.json": "{\n}\n", "web/package-lock.json": "{\n}\n" });
  gitCommitAll(repo, "init", "2026-09-01T10:00:00+03:00");
  await writeFiles(repo, { "src/a.ts": "one\ntwo\nthree\n", "src/b.ts": "b\n" });
  gitCommitAll(repo, AGENT_MESSAGE, "2026-09-10T10:00:00+03:00");
  return repo;
}

const readCode = async (git: GitRunner, repo: string, since: Date) => readRepoCode(git, repo, since, (await readRefs(git, repo)).main);

const shortHead = (repo: string) => execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

const FIX_DATE = "2026-09-11T10:00:00+03:00";
const MERGE_DATE = "2026-09-15T10:00:00+03:00";

async function fixOnBranch(): Promise<{ repo: string; fix: string }> {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/a.ts": "one\n", "src/b.ts": "b\n" });
  gitCommitAll(repo, "init", "2026-09-01T10:00:00+03:00");
  gitCheckout(repo, "fix", { create: true });
  await writeFiles(repo, { "src/a.ts": "one\ntwo\n" });
  gitCommitAll(repo, "fix: таймаут загрузки", FIX_DATE);
  const fix = shortHead(repo);
  gitCheckout(repo, "master");
  await writeFiles(repo, { "src/b.ts": "b\nc\n" });
  gitCommitAll(repo, "main: b", "2026-09-12T10:00:00+03:00");
  return { repo, fix };
}

const landedAt = async (repo: string, fix: string) => {
  const commit = (await readFixCommits(runGit, repo, { hashes: [fix], mainCommit: (await readRefs(runGit, repo)).main }))?.get(fix);
  return commit?.landedAt === undefined ? undefined : Date.parse(commit.landedAt);
};

describe("когда исправление попало в основную ветку", () => {
  it("коммит основной ветки — в свою дату", async () => {
    const repo = await sampleRepo();

    expect(await landedAt(repo, shortHead(repo))).toBe(Date.parse("2026-09-10T10:00:00+03:00"));
  });

  it("коммит ветки, слитой merge-коммитом, — в дату слияния", async () => {
    const { repo, fix } = await fixOnBranch();
    gitMergeNoFastForward(repo, "fix", MERGE_DATE);

    expect(await landedAt(repo, fix)).toBe(Date.parse(MERGE_DATE));
  });

  it("коммит ветки, слитой squash-коммитом с его заголовком в сообщении, — в дату squash-коммита", async () => {
    const { repo, fix } = await fixOnBranch();
    gitMergeSquash(repo, "fix");
    gitCommitAll(repo, "Таймаут загрузки (#12)\n\n* fix: таймаут загрузки", MERGE_DATE);

    expect(await landedAt(repo, fix)).toBe(Date.parse(MERGE_DATE));
  });

  it("коммит ветки, слитой squash-коммитом GitHub из одного коммита с суффиксом (#N), — в дату squash-коммита", async () => {
    const { repo, fix } = await fixOnBranch();
    gitMergeSquash(repo, "fix");
    gitCommitAll(repo, "fix: таймаут загрузки (#12)", MERGE_DATE);

    expect(await landedAt(repo, fix)).toBe(Date.parse(MERGE_DATE));
  });

  it("не слитый коммит ветки — даты попадания нет, даже если коммит main с тем же заголовком правит другие файлы", async () => {
    const { repo, fix } = await fixOnBranch();
    await writeFiles(repo, { "src/b.ts": "b\nc\nd\n" });
    gitCommitAll(repo, "fix: таймаут загрузки", MERGE_DATE);

    expect(await landedAt(repo, fix)).toBeUndefined();
  });

  it("не слитый коммит ветки — даты попадания нет, даже если его заголовок упомянут внутри строки сообщения", async () => {
    const { repo, fix } = await fixOnBranch();
    await writeFiles(repo, { "src/b.ts": "b\nc\nd\n" });
    gitCommitAll(repo, "docs: следом за fix: таймаут загрузки (ветка fix)", MERGE_DATE);

    expect(await landedAt(repo, fix)).toBeUndefined();
  });
});

describe("чтение git для вкладки «Код»", () => {
  it("коммиты с файлами за период и строки без lock-файлов", async () => {
    const repo = await sampleRepo();

    const code = await readCode(runGit, repo, new Date("2026-09-05T00:00:00+03:00"));

    expect(code?.commits).toEqual([["src/a.ts", "src/b.ts"]]);
    expect(code?.lines).toEqual([
      { path: "src/a.ts", lines: 3 },
      { path: "src/b.ts", lines: 1 },
    ]);
  });

  it("коммит исправления: дата и агент по трейлеру без учёта регистра, неизвестный хеш — null", async () => {
    const repo = await sampleRepo();

    const commit = (await readFixCommits(runGit, repo, { hashes: [shortHead(repo)], mainCommit: null }))?.get(shortHead(repo));

    expect(commit?.byAgent).toBe(true);
    expect(Date.parse(commit?.date ?? "")).toBe(Date.parse("2026-09-10T10:00:00+03:00"));
    expect((await readFixCommits(runGit, repo, { hashes: ["deadbee"], mainCommit: null }))?.get("deadbee")).toBeUndefined();
  });

  it("репозиторий — поддиректория: пути коммитов и строк относительны ей", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "pkg/src/a.ts": "a\n", "other/b.ts": "b\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");

    const code = await readCode(runGit, join(repo, "pkg"), new Date("2026-09-05T00:00:00+03:00"));

    expect(code?.commits).toEqual([["src/a.ts"]]);
    expect(code?.lines.every(({ path }) => path.startsWith("src/"))).toBe(true);
  });

  it.skipIf(process.platform === "win32")("путь с кавычкой не теряется в строках и коммитах (кавычка недопустима в именах файлов Windows)", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { 'src/we"ird.ts': "x\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");

    const code = await readCode(runGit, repo, new Date("2026-09-05T00:00:00+03:00"));

    expect(code?.commits).toEqual([['src/we"ird.ts']]);
    expect(code?.lines).toEqual([{ path: 'src/we"ird.ts', lines: 1 }]);
  });

  it("не git — HEAD нет и данных нет", async () => {
    const dir = await makeTempDir();

    expect(await readRefs(runGit, dir)).toEqual({ head: null, main: null });
    expect(await readCode(runGit, dir, new Date("2026-09-05T00:00:00+03:00"))).toBeNull();
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

    const code = await readCode(runGit, repo, new Date("2026-09-05T00:00:00+03:00"));

    expect(code?.units).toEqual([{ date: "2026-09-12T10:00:00+03:00", lines: 4 }]);
  });

  it("размер коммита исправления", async () => {
    const repo = await sampleRepo();

    const commit = (await readFixCommits(runGit, repo, { hashes: [shortHead(repo)], mainCommit: null }))?.get(shortHead(repo));

    expect(commit?.lines).toBe(2);
  });

  it("строки тестов в коммите исправления считаются отдельно", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "one\n" });
    gitCommitAll(repo, "init", "2026-09-01T10:00:00+03:00");
    await writeFiles(repo, { "src/a.ts": "one\ntwo\nthree\n", "src/a.test.ts": "a\nb\nc\n" });
    gitCommitAll(repo, "fix: with test", "2026-09-10T10:00:00+03:00");

    const commit = (await readFixCommits(runGit, repo, { hashes: [shortHead(repo)], mainCommit: null }))?.get(shortHead(repo));

    expect(commit).toMatchObject({ lines: 5, testLines: 3 });
  });

  it("коммит исправления меняет только lock-файл — берётся сам коммит, а не ближайший предок по пути", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "one\n" });
    gitCommitAll(repo, "init", "2026-09-01T10:00:00+03:00");
    await writeFiles(repo, { "package-lock.json": "{\n}\n" });
    gitCommitAll(repo, "fix: lockfile only", "2026-09-10T10:00:00+03:00");

    const commit = (await readFixCommits(runGit, repo, { hashes: [shortHead(repo)], mainCommit: null }))?.get(shortHead(repo));

    expect(Date.parse(commit?.date ?? "")).toBe(Date.parse("2026-09-10T10:00:00+03:00"));
    expect(commit?.lines).toBe(0);
  });

  it("репозиторий без строк текста доступен: git grep без совпадений — это ноль строк, а не ошибка", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/empty.ts": "" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");

    const code = await readCode(runGit, repo, new Date("2026-09-01T00:00:00Z"));

    expect(code).not.toBeNull();
    expect(code?.lines).toEqual([]);

    const grepFails: GitRunner = (dir, args, input) => (args[0] === "grep" ? Promise.resolve(null) : runGit(dir, args, input));
    expect(await readCode(grepFails, repo, new Date("2026-09-01T00:00:00Z"))).toBeNull();
  });

  it("основная ветка: origin/HEAD, иначе main, иначе master, иначе HEAD", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const head = (await runGit(repo, ["rev-parse", "HEAD"]))?.trim();
    const commitOn = async (branch: string, text: string): Promise<string> => {
      execFileSync("git", ["-C", repo, "checkout", "-q", "-B", branch, "master"]);
      await writeFiles(repo, { "src/a.ts": text });
      gitCommitAll(repo, `on ${branch}`, "2026-09-11T10:00:00+03:00");
      return (await runGit(repo, ["rev-parse", "HEAD"]))?.trim() ?? "";
    };

    expect((await readRefs(runGit, repo)).main).toBe(head);

    const onMain = await commitOn("main", "a\nmain\n");
    execFileSync("git", ["-C", repo, "checkout", "-q", "master"]);
    expect((await readRefs(runGit, repo)).main).toBe(onMain);

    const onWork = await commitOn("work", "a\nwork\n");
    execFileSync("git", ["-C", repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/heads/work"]);
    expect((await readRefs(runGit, repo)).main).toBe(onWork);

    execFileSync("git", ["-C", repo, "checkout", "-q", "--detach"]);
    expect((await readRefs(runGit, repo)).main).toBe(onWork);
  });

  it("в батче есть чужой хеш — свои коммиты всё равно находятся", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const first = shortHead(repo);
    await writeFiles(repo, { "src/a.ts": "a\nb\n" });
    gitCommitAll(repo, "second", "2026-09-11T10:00:00+03:00");
    const second = shortHead(repo);

    const commits = await readFixCommits(runGit, repo, { hashes: [first, "deadbee", second, "0123456789abcdef"], mainCommit: null });

    expect([...(commits?.keys() ?? [])].sort()).toEqual([first, second].sort());
    expect(commits?.get(second)?.lines).toBe(1);
  });

  it("чужие хеши проверяются одним процессом git, а не по процессу на хеш", async () => {
    const repo = await sampleRepo();
    const own = shortHead(repo);
    const alien = Array.from({ length: 20 }, (_, index) => `dead${String(index).padStart(3, "0")}`);
    const counting = countingGit();

    const commits = await readFixCommits(counting.git, repo, { hashes: [own, ...alien], mainCommit: null });

    expect([...(commits?.keys() ?? [])]).toEqual([own]);
    expect(counting.processes()).toBeLessThanOrEqual(3);
  });
});
