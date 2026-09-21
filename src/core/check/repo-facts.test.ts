import { readFile, rename, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitCommitAll, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { changedLines, collectRepoFacts } from "./repo-facts";

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

    expect(facts).toEqual({ isGit: false, commits: [], dirtyModifiedAt: new Map(), existing: new Set(["src/a.ts"]), texts: new Map([["src/a.ts", ""]]) });
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

describe("changedLines", () => {
  const lines = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `строка ${from + index}`);

  it("отдаёт строки изменённых гунков: и закоммиченные, и незакоммиченные", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/upload.ts": `${lines(1, 30).join("\n")}\n` });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFile(join(repo, "src/upload.ts"), `${[...lines(1, 9), "правка", ...lines(11, 30)].join("\n")}\n`);
    gitCommitAll(repo, "Правка десятой строки", "2026-09-12T10:00:00+03:00");
    await writeFile(join(repo, "src/upload.ts"), `${[...lines(1, 9), "правка", ...lines(11, 24), "ещё правка", ...lines(26, 30)].join("\n")}\n`);

    expect(await changedLines(repo, "src/upload.ts", new Date("2026-09-11T00:00:00+03:00"))).toEqual([
      { from: 10, to: 10 },
      { from: 25, to: 25 },
    ]);
  });

  it("удаление строк даёт диапазон вокруг места удаления", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/upload.ts": `${lines(1, 30).join("\n")}\n` });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFile(join(repo, "src/upload.ts"), `${[...lines(1, 9), ...lines(13, 30)].join("\n")}\n`);
    gitCommitAll(repo, "Убрать три строки", "2026-09-12T10:00:00+03:00");

    expect(await changedLines(repo, "src/upload.ts", new Date("2026-09-11T00:00:00+03:00"))).toEqual([{ from: 9, to: 10 }]);
  });

  it("без коммитов до отметки возвращает null", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/upload.ts": "один\n" });
    gitCommitAll(repo, "Начало", "2026-09-12T10:00:00+03:00");

    expect(await changedLines(repo, "src/upload.ts", new Date("2026-09-10T00:00:00+03:00"))).toBeNull();
  });
});
