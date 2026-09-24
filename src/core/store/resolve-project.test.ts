import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Project } from "../model/types";
import { cachedRepoRoots, findGitRoots, findProjectForDir } from "./resolve-project";
import { gitAddWorktree, gitCommitAll, ISOLATED_GIT_ENV, makeGitRepo, makeTempDir, writeFiles } from "./testing/temp-dirs";

function project(id: string, repos: string[]): Project {
  return { id, name: id, prefix: id.toUpperCase(), repos, active: true, extra: {}, body: "", path: `/backlog/${id}/project.md` };
}

async function repoWithOutsideWorktree() {
  const home = await makeTempDir();
  const repo = await makeGitRepo(home, "projects/spa");
  await writeFiles(repo, { "src/a.ts": "x\n" });
  gitCommitAll(repo, "начало", "2026-09-17T10:00:00+03:00");
  const worktree = join(home, "projects/spa-feature");
  gitAddWorktree(repo, worktree, "feature");
  return { home, repo, worktree };
}

describe("findGitRoots", () => {
  it("возвращает корень git-репозитория для вложенной директории", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    const nested = join(repo, "src/components");
    await mkdir(nested, { recursive: true });
    expect(findGitRoots(nested)).toEqual({ worktree: repo, main: repo });
  });

  it("репозиторий с --separate-git-dir: основной корень — рабочее дерево, а не каталог .git", async () => {
    const home = await makeTempDir();
    const work = join(home, "work");
    await mkdir(join(home, "sep"));
    execFileSync("git", ["init", "-q", "--separate-git-dir", join(home, "sep/.git"), work], { env: { ...process.env, ...ISOLATED_GIT_ENV } });

    expect(findGitRoots(work)).toEqual({ worktree: work, main: work });
  });

  it("вне git — null", async () => {
    expect(findGitRoots(await makeTempDir())).toBeNull();
  });
});

describe("findProjectForDir", () => {
  it("находит проект по репозиторию, в том числе из вложенной директории, через ~ и симлинк", async () => {
    const home = await makeTempDir();
    const repo = await makeGitRepo(home, "projects/spa");
    const nested = join(repo, "src");
    await mkdir(nested);
    const alias = join(home, "spa-link");
    await symlink(repo, alias);
    const projects = [project("torg", ["/nonexistent"]), project("spa", ["~/projects/spa"])];

    expect(findProjectForDir(projects, nested, home)?.id).toBe("spa");
    expect(findProjectForDir(projects, alias, home)?.id).toBe("spa");
  });

  it("находит проект, если репозиторий лежит внутри пути из repos", async () => {
    const home = await makeTempDir();
    const repo = await makeGitRepo(home, "mono/packages/web");
    expect(findProjectForDir([project("mono", [join(home, "mono")])], repo, home)?.id).toBe("mono");
  });

  it("из git worktree вне основного репозитория находит проект основного репозитория", async () => {
    const { home, repo, worktree } = await repoWithOutsideWorktree();

    expect(findProjectForDir([project("spa", [repo])], join(worktree, "src"), home)?.id).toBe("spa");
  });

  it("из git worktree проект основного репозитория побеждает зонтичный проект на родительском каталоге", async () => {
    const { home, repo, worktree } = await repoWithOutsideWorktree();
    const projects = [project("umbrella", [join(home, "projects")]), project("spa", [repo])];

    expect(findProjectForDir(projects, worktree, home)?.id).toBe("spa");
  });

  it("на файловой системе без учёта регистра находит проект, если путь в repos записан в другом регистре", async ({ skip }) => {
    const home = await makeTempDir();
    const repo = await makeGitRepo(home, "CaseRepo");
    const differentCase = join(home, "caserepo");
    if (!existsSync(differentCase)) skip();

    expect(findProjectForDir([project("case", [differentCase])], repo, home)?.id).toBe("case");
  });

  it("не путает соседние каталоги с общим префиксом имени", async () => {
    const home = await makeTempDir();
    await makeGitRepo(home, "spa");
    const neighbour = await makeGitRepo(home, "spa-admin");
    expect(findProjectForDir([project("spa", [join(home, "spa")])], neighbour, home)).toBeUndefined();
  });

  it("выбирает проект с самым специфичным репозиторием независимо от порядка в списке", async () => {
    const home = await makeTempDir();
    const parentRepo = await makeGitRepo(home, "projects");
    const nestedRepo = await makeGitRepo(parentRepo, "spa");
    const sibling = join(parentRepo, "other");
    await mkdir(sibling, { recursive: true });

    const monoProject = project("aaa-mono", [parentRepo]);
    const spaProject = project("spa", [nestedRepo]);

    for (const projects of [
      [monoProject, spaProject],
      [spaProject, monoProject],
    ]) {
      expect(findProjectForDir(projects, nestedRepo, home)?.id).toBe("spa");
      expect(findProjectForDir(projects, sibling, home)?.id).toBe("aaa-mono");
    }
  });
});

describe("cachedRepoRoots", () => {
  it("корень git для вложенного каталога, сам каталог вне git, несуществующий — null", async () => {
    const home = await makeTempDir();
    const repo = await makeGitRepo(home, "spa");
    const nested = join(repo, "src", "deep");
    await mkdir(nested, { recursive: true });
    const plain = join(home, "plain");
    await mkdir(plain);
    const rootOf = cachedRepoRoots();

    expect(await rootOf(nested)).toEqual({ worktree: repo, main: repo });
    expect(await rootOf(plain)).toEqual({ worktree: plain, main: plain });
    expect(await rootOf(join(home, "нет"))).toBeNull();
  });

  it("для git worktree вне основного репозитория отдаёт корень основного", async () => {
    const { repo, worktree } = await repoWithOutsideWorktree();

    expect(await cachedRepoRoots()(join(worktree, "src"))).toEqual({ worktree, main: repo });
  });

  it("каталог, которого не было, находится после истечения срока кэша, а не остаётся null навсегда", async () => {
    const home = await makeTempDir();
    const later = join(home, "later");
    let clock = 0;
    const rootOf = cachedRepoRoots({ ttlMs: 1000, now: () => clock });

    expect(await rootOf(later)).toBeNull();
    await makeGitRepo(home, "later");
    clock = 999;
    expect(await rootOf(later)).toBeNull();
    clock = 1000;
    expect(await rootOf(later)).toEqual({ worktree: later, main: later });
  });
});
