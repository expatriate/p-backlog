import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Project } from "../model/types";
import { fixKey } from "../stats/code/fixes";
import { gitCommitAll, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { CODE_CACHE_FILE, createCodeCacheFile } from "./code-cache";
import { createCodeSource, type CodeSource } from "./code-source";
import { runGit, type GitRunner } from "../git/run";

const NOW = new Date("2026-09-18T12:00:00+03:00");
const projectOf = (id: string, repos: string[]): Project => ({ id, name: `Проект ${id}`, prefix: "SPA", repos, extra: {}, body: "", path: `/backlog/${id}/project.md` });

describe("сбор данных git по проектам", () => {
  it("проекты с данными репозиториев, недоступные пути, коммиты исправлений по ключу проекта", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const head = (await runGit(repo, ["rev-parse", "--short", "HEAD"]))?.trim() ?? "";
    const source: CodeSource = createCodeSource({ home: "/home/backlog-test" });

    const code = await source.collect([projectOf("spa", [repo, "/nope/repo"])], [{ projectId: "spa", hashes: [head, "deadbee"] }], NOW);

    expect(code.projects).toEqual([{ projectId: "spa", name: "Проект spa", repos: [{ commits: [["src/a.ts"]], lines: [{ path: "src/a.ts", lines: 1 }], units: [{ date: "2026-09-10T10:00:00+03:00", lines: 1 }] }] }]);
    expect(code.unavailableRepos).toEqual(["/nope/repo"]);
    expect(code.fixCommits.get(fixKey("spa", head))?.byAgent).toBe(false);
    expect(code.fixCommits.has(fixKey("spa", "deadbee"))).toBe(false);
  });

  it("репозиторий с `~` раскрывается в домашний каталог перед обращением к git", async () => {
    const home = await makeTempDir();
    const repo = await makeGitRepo(home, "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const source: CodeSource = createCodeSource({ home });

    const code = await source.collect([projectOf("spa", ["~/spa"])], [], NOW);

    expect(code.projects).toEqual([{ projectId: "spa", name: "Проект spa", repos: [{ commits: [["src/a.ts"]], lines: [{ path: "src/a.ts", lines: 1 }], units: [{ date: "2026-09-10T10:00:00+03:00", lines: 1 }] }] }]);
    expect(code.unavailableRepos).toEqual([]);
  });

  it("недоступный путь остаётся в списке таким, как записан в project.md", async () => {
    const source: CodeSource = createCodeSource({ home: "/home/backlog-test" });

    const code = await source.collect([projectOf("spa", ["~/nope"])], [], NOW);

    expect(code.unavailableRepos).toEqual(["~/nope"]);
  });

  it("при том же HEAD и дне данные берутся из кэша, после нового коммита читаются заново", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const onlyRevParse: GitRunner = (dir, args) => (args[0] === "rev-parse" ? runGit(dir, args) : Promise.resolve(null));
    let git: GitRunner = runGit;
    const source = createCodeSource({ home: "/home/backlog-test", git: (dir, args) => git(dir, args) });
    const projects = [projectOf("spa", [repo])];

    const first = await source.collect(projects, [], NOW);
    git = onlyRevParse;

    expect((await source.collect(projects, [], NOW)).projects).toEqual(first.projects);

    await writeFiles(repo, { "src/a.ts": "a\nb\n" });
    gitCommitAll(repo, "second", "2026-09-12T10:00:00+03:00");

    expect((await source.collect(projects, [], NOW)).unavailableRepos).toEqual([repo]);
  });

  it("один и тот же недоступный путь у двух проектов — одна запись", async () => {
    const source: CodeSource = createCodeSource({ home: "/home/backlog-test" });

    const code = await source.collect([projectOf("a", ["/nope/repo"]), projectOf("b", ["/nope/repo"])], [], NOW);

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
    const first = await createCodeSource({ home: "/h", store: createCodeCacheFile(cacheRoot) }).collect(projects, requests, NOW);

    const onlyRevParse: GitRunner = (dir, args) => (args[0] === "rev-parse" ? runGit(dir, args) : Promise.resolve(null));
    const restarted = await createCodeSource({ home: "/h", git: onlyRevParse, store: createCodeCacheFile(cacheRoot) }).collect(projects, requests, NOW);

    expect(restarted.projects).toEqual(first.projects);
    expect(restarted.fixCommits.get(fixKey("spa", head))).toEqual(first.fixCommits.get(fixKey("spa", head)));
    expect(JSON.parse(await readFile(join(cacheRoot, CODE_CACHE_FILE), "utf8")).fixes).not.toHaveProperty(`${repo} deadbee`);

    await writeFile(join(cacheRoot, CODE_CACHE_FILE), "{битый", "utf8");
    const fromGit = await createCodeSource({ home: "/h", store: createCodeCacheFile(cacheRoot) }).collect(projects, requests, NOW);
    expect(fromGit.projects).toEqual(first.projects);
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

    expect((await source.collect([projectOf("spa", [repo])], request, NOW)).fixCommits.has(fixKey("spa", hash))).toBe(false);

    execFileSync("git", ["-C", repo, "fetch", "-q", clone, "HEAD"]);

    expect((await source.collect([projectOf("spa", [repo])], request, NOW)).fixCommits.has(fixKey("spa", hash))).toBe(true);
  });
});
