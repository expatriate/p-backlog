import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatLocalDay } from "../model/dates";
import { DAY_MS } from "../model/lifecycle";
import type { Project } from "../model/types";
import { fixKey } from "../stats/code/fixes";
import { ISOLATED_GIT_ENV, gitCheckout, gitCommitAll, gitMergeNoFastForward, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { CODE_CACHE_FILE, createCodeCacheFile, type CodeCacheStore } from "./code-cache";
import { createCodeSource, type CodeSource } from "./code-source";
import { runGit, type GitRunner } from "../git/run";
import { countingGit } from "../git/testing/counting-git";

const NOW = new Date("2026-09-18T12:00:00+03:00");
const projectOf = (id: string, repos: string[]): Project => ({ id, name: `Проект ${id}`, prefix: "SPA", repos, active: true, extra: {}, body: "", path: `/backlog/${id}/project.md` });
const fullHead = async (repo: string): Promise<string> => (await runGit(repo, ["rev-parse", "HEAD"]))?.trim() ?? "";

function gitAmendAll(repo: string, isoDate: string): void {
  const env = { ...process.env, ...ISOLATED_GIT_ENV, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate };
  execFileSync("git", ["add", "-A"], { cwd: repo, env });
  execFileSync("git", ["-c", "user.name=backlog-test", "-c", "user.email=test@backlog.local", "-c", "commit.gpgsign=false", "commit", "-q", "--amend", "--no-edit"], { cwd: repo, env });
}

describe("сбор данных git по проектам", () => {
  it("проекты с данными репозиториев, недоступные пути, коммиты исправлений по ключу проекта", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const head = (await runGit(repo, ["rev-parse", "--short", "HEAD"]))?.trim() ?? "";
    const source: CodeSource = createCodeSource({ home: "/home/backlog-test" });

    const projects = [projectOf("spa", [repo, "/nope/repo"])];
    const code = await source.collect(projects, NOW);
    const fixCommits = await source.fixCommits(projects, [{ projectId: "spa", hashes: [head, "deadbee"] }], NOW);

    expect(code.projects).toEqual([{ projectId: "spa", name: "Проект spa", repos: [{ commits: [["src/a.ts"]], lines: [{ path: "src/a.ts", lines: 1 }], units: [{ date: "2026-09-10T10:00:00+03:00", lines: 1 }] }] }]);
    expect(code.unavailableRepos).toEqual(["/nope/repo"]);
    expect(fixCommits.get(fixKey("spa", head))?.byAgent).toBe(false);
    expect(fixCommits.has(fixKey("spa", "deadbee"))).toBe(false);
  });

  it("репозиторий с `~` раскрывается в домашний каталог перед обращением к git", async () => {
    const home = await makeTempDir();
    const repo = await makeGitRepo(home, "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const source: CodeSource = createCodeSource({ home });

    const code = await source.collect([projectOf("spa", ["~/spa"])], NOW);

    expect(code.projects).toEqual([{ projectId: "spa", name: "Проект spa", repos: [{ commits: [["src/a.ts"]], lines: [{ path: "src/a.ts", lines: 1 }], units: [{ date: "2026-09-10T10:00:00+03:00", lines: 1 }] }] }]);
    expect(code.unavailableRepos).toEqual([]);
  });

  it("недоступный путь остаётся в списке таким, как записан в project.md", async () => {
    const source: CodeSource = createCodeSource({ home: "/home/backlog-test" });

    const code = await source.collect([projectOf("spa", ["~/nope"])], NOW);

    expect(code.unavailableRepos).toEqual(["~/nope"]);
  });

  it("при том же HEAD и дне данные берутся из кэша, после нового коммита читаются заново", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const onlyRefs: GitRunner = (dir, args, input) => (args[0] === "cat-file" ? runGit(dir, args, input) : Promise.resolve(null));
    let git: GitRunner = runGit;
    const source = createCodeSource({ home: "/home/backlog-test", git: (dir, args, input) => git(dir, args, input) });
    const projects = [projectOf("spa", [repo])];

    const first = await source.collect(projects, NOW);
    git = onlyRefs;

    expect((await source.collect(projects, NOW)).projects).toEqual(first.projects);

    await writeFiles(repo, { "src/a.ts": "a\nb\n" });
    gitCommitAll(repo, "second", "2026-09-12T10:00:00+03:00");

    expect((await source.collect(projects, NOW)).unavailableRepos).toEqual([repo]);
  });

  it("один и тот же недоступный путь у двух проектов — одна запись", async () => {
    const source: CodeSource = createCodeSource({ home: "/home/backlog-test" });

    const code = await source.collect([projectOf("a", ["/nope/repo"]), projectOf("b", ["/nope/repo"])], NOW);

    expect(code.unavailableRepos).toEqual(["/nope/repo"]);
  });

  it("после перезапуска данные репозитория и коммиты исправлений берутся с диска, битый файл — из git", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const head = (await runGit(repo, ["rev-parse", "--short", "HEAD"]))?.trim() ?? "";
    const cacheRoot = await makeTempDir();
    const projects = [projectOf("spa", [repo])];
    const requests = [{ projectId: "spa", hashes: [head, "deadbee"] }];
    const gathered = async (source: CodeSource) => ({ code: await source.collect(projects, NOW), fixCommits: await source.fixCommits(projects, requests, NOW) });
    const first = await gathered(createCodeSource({ home: "/h", store: createCodeCacheFile(cacheRoot) }));

    const onlyRefs: GitRunner = (dir, args, input) => (args[0] === "cat-file" ? runGit(dir, args, input) : Promise.resolve(null));
    const restarted = await gathered(createCodeSource({ home: "/h", git: onlyRefs, store: createCodeCacheFile(cacheRoot) }));

    expect(restarted.code.projects).toEqual(first.code.projects);
    expect(restarted.fixCommits.get(fixKey("spa", head))).toEqual(first.fixCommits.get(fixKey("spa", head)));
    expect(JSON.parse(await readFile(join(cacheRoot, CODE_CACHE_FILE), "utf8")).fixes).not.toHaveProperty(`${repo} deadbee`);

    await writeFile(join(cacheRoot, CODE_CACHE_FILE), "{битый", "utf8");
    const fromGit = await createCodeSource({ home: "/h", store: createCodeCacheFile(cacheRoot) }).collect(projects, NOW);
    expect(fromGit).toEqual(first.code);
  });

  it("репозиторий, убранный из всех проектов, уходит из файла кэша вместе с его исправлениями, а сбор по одному проекту не трогает репозитории других", async () => {
    const parent = await makeTempDir();
    const committedRepo = async (name: string) => {
      const repo = await makeGitRepo(parent, name);
      await writeFiles(repo, { "src/a.ts": "a\n" });
      gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
      return repo;
    };
    const [a, b, c] = [await committedRepo("a"), await committedRepo("b"), await committedRepo("c")];
    const bHead = (await runGit(b, ["rev-parse", "--short", "HEAD"]))?.trim() ?? "";
    const removedFix = `${b} ${bHead}`;
    const cacheRoot = await makeTempDir();
    const cached = async () => JSON.parse(await readFile(join(cacheRoot, CODE_CACHE_FILE), "utf8")) as { repos: object; fixes: object };
    const source = createCodeSource({ home: "/h", store: createCodeCacheFile(cacheRoot) });
    const all = [projectOf("a", [a]), projectOf("b", [b]), projectOf("c", [c])];
    source.retain(all);
    await source.collect(all, NOW);
    await source.fixCommits(all, [{ projectId: "b", hashes: [bHead] }], NOW);
    expect(Object.keys((await cached()).fixes)).toContain(removedFix);

    const withoutB = [projectOf("a", [a]), projectOf("c", [c])];
    source.retain(withoutB);
    await source.collect(withoutB.slice(0, 1), NOW);

    expect(Object.keys((await cached()).repos).sort()).toEqual([a, c].sort());
    expect(Object.keys((await cached()).fixes)).not.toContain(removedFix);
  });

  it("неудавшаяся запись кэша повторяется при следующем сборе, даже если новых данных нет", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const cacheRoot = await makeTempDir();
    const file = createCodeCacheFile(cacheRoot);
    let writes = 0;
    const flaky: CodeCacheStore = { read: file.read, write: (snapshot) => (writes++ === 0 ? Promise.reject(new Error("диск занят")) : file.write(snapshot)) };
    const projects = [projectOf("spa", [repo])];
    const source = createCodeSource({ home: "/h", store: flaky });

    const first = await source.collect(projects, NOW);
    await source.collect(projects, NOW);

    const onlyRefs: GitRunner = (dir, args, input) => (args[0] === "cat-file" ? runGit(dir, args, input) : Promise.resolve(null));
    expect(await createCodeSource({ home: "/h", git: onlyRefs, store: createCodeCacheFile(cacheRoot) }).collect(projects, NOW)).toEqual(first);
  });

  it("коммит исправления, подтянутый позже через fetch, находится без перезапуска", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const clone = join(await makeTempDir(), "clone");
    execFileSync("git", ["clone", "-q", repo, clone]);
    await writeFiles(clone, { "src/a.ts": "b\n" });
    gitCommitAll(clone, "fix elsewhere", "2026-09-11T10:00:00+03:00");
    const hash = (await runGit(clone, ["rev-parse", "--short", "HEAD"]))?.trim() ?? "";
    const source = createCodeSource({ home: "/h" });
    const request = [{ projectId: "spa", hashes: [hash] }];

    expect((await source.fixCommits([projectOf("spa", [repo])], request, NOW)).has(fixKey("spa", hash))).toBe(false);

    execFileSync("git", ["-C", repo, "fetch", "-q", clone, "HEAD"]);

    expect((await source.fixCommits([projectOf("spa", [repo])], request, NOW)).has(fixKey("spa", hash))).toBe(true);
  });

  it("коммит исправления, прочитанный до слияния ветки, после слияния получает дату попадания в основную ветку", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    gitCheckout(repo, "fix", { create: true });
    await writeFiles(repo, { "src/a.ts": "a\nb\n" });
    gitCommitAll(repo, "fix: b", "2026-09-11T10:00:00+03:00");
    const hash = (await runGit(repo, ["rev-parse", "--short", "HEAD"]))?.trim() ?? "";
    gitCheckout(repo, "master");
    const counting = countingGit();
    const source = createCodeSource({ home: "/h", git: counting.git });
    const request = [{ projectId: "spa", hashes: [hash] }];
    const landedAt = async () => (await source.fixCommits([projectOf("spa", [repo])], request, NOW)).get(fixKey("spa", hash))?.landedAt;

    const beforeMerge = await landedAt();
    const processesBeforeMerge = counting.processes();
    await landedAt();
    const processesWhileMainUnchanged = counting.processes() - processesBeforeMerge;
    gitMergeNoFastForward(repo, "fix", "2026-09-15T10:00:00+03:00");

    expect(beforeMerge).toBeUndefined();
    expect(processesWhileMainUnchanged).toBeLessThan(processesBeforeMerge);
    expect(Date.parse((await landedAt()) ?? "")).toBe(Date.parse("2026-09-15T10:00:00+03:00"));
  });

  it("хеши, которых нет в репозитории, проверяются одним процессом git, а не по процессу на хеш", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const counting = countingGit();
    const source = createCodeSource({ home: "/h", git: counting.git });
    const hashes = Array.from({ length: 30 }, (_, index) => `deadbe${index.toString(16).padStart(2, "0")}`);

    await source.fixCommits([projectOf("spa", [repo])], [{ projectId: "spa", hashes }], NOW);

    expect(counting.processes()).toBe(2);
  });

  it("сбой git при чтении коммита исправления не мешает найти его при следующем сборе", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const head = (await runGit(repo, ["rev-parse", "--short", "HEAD"]))?.trim() ?? "";
    const fixLogFails: GitRunner = (dir, args, input) => (args[0] === "log" && args[1] === "--no-walk=unsorted" ? Promise.resolve(null) : runGit(dir, args, input));
    let git = fixLogFails;
    const source = createCodeSource({ home: "/h", git: (dir, args, input) => git(dir, args, input) });
    const request = [{ projectId: "spa", hashes: [head] }];

    expect((await source.fixCommits([projectOf("spa", [repo])], request, NOW)).has(fixKey("spa", head))).toBe(false);
    git = runGit;

    expect((await source.fixCommits([projectOf("spa", [repo])], request, NOW)).has(fixKey("spa", head))).toBe(true);
  });

  it("сбой подсчёта строк коммита исправления не запоминает его с нулём строк", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    await writeFiles(repo, { "src/a.ts": "a\nb\n" });
    gitCommitAll(repo, "fix", "2026-09-11T10:00:00+03:00");
    const head = (await runGit(repo, ["rev-parse", "--short", "HEAD"]))?.trim() ?? "";
    const numstatFails: GitRunner = (dir, args, input) => (args.includes("--numstat") ? Promise.resolve(null) : runGit(dir, args, input));
    let git = numstatFails;
    const source = createCodeSource({ home: "/h", git: (dir, args, input) => git(dir, args, input) });
    const request = [{ projectId: "spa", hashes: [head] }];

    expect((await source.fixCommits([projectOf("spa", [repo])], request, NOW)).has(fixKey("spa", head))).toBe(false);
    git = runGit;

    expect((await source.fixCommits([projectOf("spa", [repo])], request, NOW)).get(fixKey("spa", head))?.lines).toBe(1);
  });

  it("исправление по коммиту старше окна кода, пока его запрашивают, не перечитывается из git", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "давнее исправление", "2026-05-01T10:00:00+03:00");
    const head = (await runGit(repo, ["rev-parse", "--short", "HEAD"]))?.trim() ?? "";
    const counting = countingGit();
    const source = createCodeSource({ home: "/h", git: counting.git });
    const request = [{ projectId: "spa", hashes: [head] }];
    await source.fixCommits([projectOf("spa", [repo])], request, NOW);
    counting.reset();

    const again = await source.fixCommits([projectOf("spa", [repo])], request, NOW);

    expect(again.has(fixKey("spa", head))).toBe(true);
    expect(counting.processes()).toBe(1);
  });

  it("после новых коммитов результат равен полному сканированию, а git читает только новый диапазон", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const old = await fullHead(repo);
    const calls: string[][] = [];
    const recording: GitRunner = (dir, args, input) => {
      calls.push(args);
      return runGit(dir, args, input);
    };
    const source = createCodeSource({ home: "/h", git: recording });
    const projects = [projectOf("spa", [repo])];
    await source.collect(projects, NOW);
    await writeFiles(repo, { "src/b.ts": "b\n" });
    gitCommitAll(repo, "second", "2026-09-12T10:00:00+03:00");
    await writeFiles(repo, { "src/a.ts": "a\nc\n" });
    gitCommitAll(repo, "third", "2026-09-13T10:00:00+03:00");
    const range = `${old}..${await fullHead(repo)}`;
    calls.length = 0;

    const updated = await source.collect(projects, NOW);

    expect(updated).toEqual(await createCodeSource({ home: "/h" }).collect(projects, NOW));
    const logs = calls.filter((args) => args[0] === "log");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.filter((args) => !args.includes(range))).toEqual([]);
  });

  it("после commit --amend результат равен полному сканированию", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    await writeFiles(repo, { "src/b.ts": "b\n" });
    gitCommitAll(repo, "second", "2026-09-12T10:00:00+03:00");
    const source = createCodeSource({ home: "/h" });
    const projects = [projectOf("spa", [repo])];
    await source.collect(projects, NOW);
    await rm(join(repo, "src/b.ts"));
    await writeFiles(repo, { "src/c.ts": "c\n" });
    gitAmendAll(repo, "2026-09-13T10:00:00+03:00");

    expect(await source.collect(projects, NOW)).toEqual(await createCodeSource({ home: "/h" }).collect(projects, NOW));
  });

  it("на следующий день коммиты, вышедшие из окна, отбрасываются без git", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "на краю окна", "2026-06-21T10:00:00+03:00");
    await writeFiles(repo, { "src/b.ts": "b\n" });
    gitCommitAll(repo, "свежий", "2026-09-10T10:00:00+03:00");
    const onlyRefs: GitRunner = (dir, args, input) => (args[0] === "cat-file" ? runGit(dir, args, input) : Promise.resolve(null));
    let git: GitRunner = runGit;
    const source = createCodeSource({ home: "/h", git: (dir, args, input) => git(dir, args, input) });
    const projects = [projectOf("spa", [repo])];
    await source.collect(projects, NOW);
    git = onlyRefs;
    const later = new Date(NOW.getTime() + 2 * DAY_MS);

    const fresh = await createCodeSource({ home: "/h" }).collect(projects, later);

    expect(await source.collect(projects, later)).toEqual(fresh);
    expect(fresh.projects[0]?.repos[0]?.commits).toEqual([["src/b.ts"]]);
  });

  it("после перезапуска не попавшее в основную ветку исправление не перепроверяется, пока она не сдвинулась", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    gitCheckout(repo, "fix", { create: true });
    await writeFiles(repo, { "src/a.ts": "a\nb\n" });
    gitCommitAll(repo, "fix: b", "2026-09-11T10:00:00+03:00");
    const hash = (await runGit(repo, ["rev-parse", "--short", "HEAD"]))?.trim() ?? "";
    gitCheckout(repo, "master");
    const cacheRoot = await makeTempDir();
    const projects = [projectOf("spa", [repo])];
    const request = [{ projectId: "spa", hashes: [hash] }];
    await createCodeSource({ home: "/h", store: createCodeCacheFile(cacheRoot) }).fixCommits(projects, request, NOW);
    let landingChecks = 0;
    const countingLanding: GitRunner = (dir, args, input) => {
      if (args.includes("--ancestry-path")) landingChecks++;
      return runGit(dir, args, input);
    };
    const restarted = createCodeSource({ home: "/h", git: countingLanding, store: createCodeCacheFile(cacheRoot) });

    const unchangedMain = await restarted.fixCommits(projects, request, NOW);

    expect(unchangedMain.has(fixKey("spa", hash))).toBe(true);
    expect(landingChecks).toBe(0);

    await writeFiles(repo, { "src/c.ts": "c\n" });
    gitCommitAll(repo, "main moves", "2026-09-12T10:00:00+03:00");
    await restarted.fixCommits(projects, request, NOW);

    expect(landingChecks).toBeGreaterThan(0);
  });

  it("файл кэша прежнего формата читается как отсутствующий: полное сканирование без ошибки", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const head = await fullHead(repo);
    const cacheRoot = await makeTempDir();
    const staleCode = { commits: [["src/stale.ts"]], lines: [], units: [] };
    await writeFile(join(cacheRoot, CODE_CACHE_FILE), JSON.stringify({ version: 1, repos: { [repo]: { key: `${head} ${head} ${formatLocalDay(NOW)}`, code: staleCode } }, fixes: {} }), "utf8");
    const errors: unknown[] = [];
    const projects = [projectOf("spa", [repo])];

    const code = await createCodeSource({ home: "/h", store: createCodeCacheFile(cacheRoot), onError: (_kind, error) => errors.push(error) }).collect(projects, NOW);

    expect(code).toEqual(await createCodeSource({ home: "/h" }).collect(projects, NOW));
    expect(errors).toEqual([]);
  });

  it("слияние ветки, выросшей из ранее слитой ветки с отменённым изменением, даёт то же, что полное сканирование", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    gitCheckout(repo, "side", { create: true });
    await writeFiles(repo, { "src/x.ts": "x\n" });
    gitCommitAll(repo, "side: x", "2026-09-11T10:00:00+03:00");
    await rm(join(repo, "src/x.ts"));
    gitCommitAll(repo, "side: revert x", "2026-09-11T11:00:00+03:00");
    gitCheckout(repo, "master");
    await writeFiles(repo, { "src/a.ts": "a\nb\n" });
    gitCommitAll(repo, "main: b", "2026-09-12T10:00:00+03:00");
    gitMergeNoFastForward(repo, "side", "2026-09-13T10:00:00+03:00");
    const source = createCodeSource({ home: "/h" });
    const projects = [projectOf("spa", [repo])];
    await source.collect(projects, NOW);
    gitCheckout(repo, "side");
    gitCheckout(repo, "next", { create: true });
    await writeFiles(repo, { "src/z.ts": "z\n" });
    gitCommitAll(repo, "next: z", "2026-09-11T12:00:00+03:00");
    gitCheckout(repo, "master");
    gitMergeNoFastForward(repo, "next", "2026-09-15T10:00:00+03:00");

    expect(await source.collect(projects, NOW)).toEqual(await createCodeSource({ home: "/h" }).collect(projects, NOW));
  });

  it("основная ветка переставлена на слияние, где прежняя — второй родитель: единицы изменений как при полном сканировании", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    gitCheckout(repo, "main", { create: true });
    await writeFiles(repo, { "src/b.ts": "b\n" });
    gitCommitAll(repo, "main: b", "2026-09-11T10:00:00+03:00");
    gitCheckout(repo, "master");
    const source = createCodeSource({ home: "/h" });
    const projects = [projectOf("spa", [repo])];
    await source.collect(projects, NOW);
    gitCheckout(repo, "feature", { create: true });
    await writeFiles(repo, { "src/c.ts": "c\n" });
    gitCommitAll(repo, "feature: c", "2026-09-12T10:00:00+03:00");
    gitMergeNoFastForward(repo, "main", "2026-09-13T10:00:00+03:00");
    execFileSync("git", ["-C", repo, "branch", "-f", "main", "feature"]);
    gitCheckout(repo, "master");

    expect(await source.collect(projects, NOW)).toEqual(await createCodeSource({ home: "/h" }).collect(projects, NOW));
  });

  it("ключ состояния — один процесс git на репозиторий", async () => {
    const repos = [await makeGitRepo(await makeTempDir(), "a"), await makeGitRepo(await makeTempDir(), "b")];
    for (const repo of repos) {
      await writeFiles(repo, { "src/a.ts": "a\n" });
      gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    }
    const counting = countingGit();

    await createCodeSource({ home: "/h", git: counting.git }).stateKey([projectOf("spa", repos)]);

    expect(counting.processes()).toBe(2);
  });
});
