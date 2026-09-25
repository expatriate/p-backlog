import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Project } from "../model/types";
import { fixKey } from "../stats/code/fixes";
import { gitCheckout, gitCommitAll, gitMergeNoFastForward, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { CODE_CACHE_FILE, createCodeCacheFile, type CodeCacheStore } from "./code-cache";
import { createCodeSource, type CodeSource } from "./code-source";
import { runGit, type GitRunner } from "../git/run";
import { countingGit } from "../git/testing/counting-git";

const NOW = new Date("2026-09-18T12:00:00+03:00");
const projectOf = (id: string, repos: string[]): Project => ({ id, name: `Проект ${id}`, prefix: "SPA", repos, active: true, extra: {}, body: "", path: `/backlog/${id}/project.md` });

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
