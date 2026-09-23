import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Project } from "../model/types";
import { cachedRepoRoots, findProjectForDir, findRepoRoot } from "./resolve-project";
import { makeGitRepo, makeTempDir } from "./testing/temp-dirs";

function project(id: string, repos: string[]): Project {
  return { id, name: id, prefix: id.toUpperCase(), repos, active: true, extra: {}, body: "", path: `/backlog/${id}/project.md` };
}

describe("findRepoRoot", () => {
  it("возвращает корень git-репозитория для вложенной директории", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    const nested = join(repo, "src/components");
    await mkdir(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(repo);
  });

  it("возвращает саму директорию вне git", async () => {
    const dir = await makeTempDir();
    expect(findRepoRoot(dir)).toBe(dir);
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

    expect(await rootOf(nested)).toBe(repo);
    expect(await rootOf(plain)).toBe(plain);
    expect(await rootOf(join(home, "нет"))).toBeNull();
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
    expect(await rootOf(later)).toBe(later);
  });
});
