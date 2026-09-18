import { readFile, rename, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitCommitAll, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { collectRepoFacts } from "./repo-facts";

describe("collectRepoFacts", () => {
  it("собирает коммиты после даты с файлами и переименованиями, незакоммиченные правки и существующие файлы", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "export const a = 1;\n", "src/old.ts": "export const old = 1;\n", "src/загрузка.ts": "" });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFile(join(repo, "src/a.ts"), "export const a = 2;\n");
    gitCommitAll(repo, "Поправить a", "2026-09-12T10:00:00+03:00");
    await rename(join(repo, "src/old.ts"), join(repo, "src/new.ts"));
    await writeFile(join(repo, "src/загрузка.ts"), "export {};\n");
    gitCommitAll(repo, "Переименовать old", "2026-09-13T10:00:00+03:00");
    await writeFile(join(repo, "src/a.ts"), "export const a = 3;\n");

    const facts = await collectRepoFacts(repo, { since: new Date("2026-09-11T00:00:00Z"), paths: ["src/a.ts", "src/old.ts", "src/new.ts"] });

    expect(facts.isGit).toBe(true);
    expect(facts.commits.map(({ subject, date, files }) => ({ subject, date, files }))).toEqual([
      {
        subject: "Переименовать old",
        date: "2026-09-13T10:00:00+03:00",
        files: [{ path: "src/new.ts", renamedFrom: "src/old.ts" }, { path: "src/загрузка.ts" }],
      },
      { subject: "Поправить a", date: "2026-09-12T10:00:00+03:00", files: [{ path: "src/a.ts" }] },
    ]);
    expect(facts.commits[0]?.sha).toMatch(/^[0-9a-f]{7,}$/);
    expect([...facts.dirtyModifiedAt.keys()]).toEqual(["src/a.ts"]);
    expect(facts.existing).toEqual(new Set(["src/a.ts", "src/new.ts"]));
  });

  it("каталог без git: только существование файлов", async () => {
    const dir = await makeTempDir();
    await writeFiles(dir, { "src/a.ts": "" });

    const facts = await collectRepoFacts(dir, { since: new Date("2026-09-11T00:00:00Z"), paths: ["src/a.ts", "src/b.ts"] });

    expect(facts).toEqual({ isGit: false, commits: [], dirtyModifiedAt: new Map(), existing: new Set(["src/a.ts"]) });
  });

  it("не переписывает индекс git: сбор фактов не берёт index.lock, пока с репозиторием работает пользователь", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "export const a = 1;\n" });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    const staleStat = new Date("2026-01-01T00:00:00Z");
    await utimes(join(repo, "src/a.ts"), staleStat, staleStat);
    const indexBefore = await readFile(join(repo, ".git/index"));

    await collectRepoFacts(repo, { since: new Date("2026-09-01T00:00:00Z"), paths: ["src/a.ts"] });

    expect(await readFile(join(repo, ".git/index"))).toEqual(indexBefore);
  });
});
