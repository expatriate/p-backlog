import { describe, expect, it } from "vitest";
import type { Project } from "../model/types";
import { fixKey } from "../stats/code/fixes";
import { gitCommitAll, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { createCodeSource, type CodeSource } from "./code-source";
import { runGit, type GitRunner } from "./git-code";

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

  it("при том же HEAD и дне git читается один раз", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const calls: string[] = [];
    const counting: GitRunner = async (dir, args) => {
      calls.push(args[0] ?? "");
      return await runGit(dir, args);
    };
    const source = createCodeSource({ home: "/home/backlog-test", git: counting });

    await source.collect([projectOf("spa", [repo])], [], NOW);
    await source.collect([projectOf("spa", [repo])], [], NOW);

    expect(calls.filter((call) => call === "log")).toHaveLength(2);
    expect(calls.filter((call) => call === "rev-parse")).toHaveLength(5);
  });

  it("один и тот же недоступный путь у двух проектов — одна запись", async () => {
    const source: CodeSource = createCodeSource({ home: "/home/backlog-test" });

    const code = await source.collect([projectOf("a", ["/nope/repo"]), projectOf("b", ["/nope/repo"])], [], NOW);

    expect(code.unavailableRepos).toEqual(["/nope/repo"]);
  });
});
