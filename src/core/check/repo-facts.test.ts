import { execFileSync } from "node:child_process";
import { readFile, rename, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitCheckout, gitCommitAll, gitMergeNoFastForward, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { countingGit } from "../git/testing/counting-git";
import { collectRepoFacts, diffsSince } from "./repo-facts";

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

    const facts = await collectRepoFacts(repo, { since: new Date("2026-09-11T00:00:00Z"), paths: ["src/a.ts", "src/old.ts", "src/new.ts", "src/загрузка.ts"] });

    expect(facts.history).toBe("read");
    expect(facts.renames.map(({ subject, files }) => ({ subject, files }))).toEqual([{ subject: "Переименовать old", files: [{ path: "src/new.ts", renamedFrom: "src/old.ts" }] }]);
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
    expect(facts.existing).toEqual(new Set(["src/a.ts", "src/new.ts", "src/загрузка.ts"]));
  });

  it("репозиторий проекта — подкаталог git: пути коммитов и незакоммиченных правок от каталога проекта", async () => {
    const mono = await makeGitRepo(await makeTempDir(), "mono");
    await writeFiles(mono, { "app/src/a.ts": "export const a = 1;\n", "lib/b.ts": "export const b = 1;\n" });
    gitCommitAll(mono, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFiles(mono, { "app/src/a.ts": "export const a = 2;\n", "lib/b.ts": "export const b = 2;\n" });
    gitCommitAll(mono, "Поправить a и b", "2026-09-12T10:00:00+03:00");
    await writeFiles(mono, { "app/src/a.ts": "export const a = 3;\n", "lib/b.ts": "export const b = 3;\n" });

    const facts = await collectRepoFacts(join(mono, "app"), { since: new Date("2026-09-11T00:00:00Z"), paths: ["src/a.ts"] });

    expect(facts.commits.map(({ files }) => files)).toEqual([[{ path: "src/a.ts" }]]);
    expect([...facts.dirtyModifiedAt.keys()]).toEqual(["src/a.ts"]);
  });

  it("путь с кавычкой и табуляцией приходит из истории как есть, а не в C-кавычках", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    const odd = 'src/"quoted"\tname.ts';
    await writeFiles(repo, { [odd]: "a\n" });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFile(join(repo, odd), "b\n");
    gitCommitAll(repo, "Правка", "2026-09-12T10:00:00+03:00");

    const facts = await collectRepoFacts(repo, { since: new Date("2026-09-11T00:00:00Z"), paths: [odd] });

    expect(facts.commits.map(({ files }) => files)).toEqual([[{ path: odd }]]);
  });

  it("путь задачи вне репозитория не ломает чтение истории остальных задач", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "export const a = 1;\n" });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFile(join(repo, "src/a.ts"), "export const a = 2;\n");
    gitCommitAll(repo, "Поправить a", "2026-09-12T10:00:00+03:00");

    const facts = await collectRepoFacts(repo, { since: new Date("2026-09-11T00:00:00Z"), paths: ["../outside.ts", "", "src/a.ts"] });

    expect(facts.history).toBe("read");
    expect(facts.commits.map(({ files }) => files)).toEqual([[{ path: "src/a.ts" }]]);
  });

  it("каталог без git: только существование файлов", async () => {
    const dir = await makeTempDir();
    await writeFiles(dir, { "src/a.ts": "" });

    const facts = await collectRepoFacts(dir, { since: new Date("2026-09-11T00:00:00Z"), paths: ["src/a.ts", "src/b.ts"] });

    expect(facts).toEqual({ history: "not-a-repo", commits: [], renames: [], dirtyModifiedAt: new Map(), existing: new Set(["src/a.ts"]), texts: new Map([["src/a.ts", ""]]) });
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

describe("diffsSince", () => {
  const lines = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `строка ${from + index}`);
  const changedLines = async (repo: string, path: string, since: Date) => (await diffsSince(repo)(path, since))?.changed ?? null;

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

  it("внешний diff-инструмент и textconv из настроек git не подменяют разбор гунков", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/upload.ts": `${lines(1, 30).join("\n")}\n`, ".gitattributes": "*.ts diff=shout\n" });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFile(join(repo, "src/upload.ts"), `${[...lines(1, 9), "правка", ...lines(11, 30)].join("\n")}\n`);
    gitCommitAll(repo, "Правка десятой строки", "2026-09-12T10:00:00+03:00");
    execFileSync("git", ["config", "diff.external", "echo"], { cwd: repo });
    execFileSync("git", ["config", "diff.shout.textconv", "sed 1d"], { cwd: repo });

    expect(await changedLines(repo, "src/upload.ts", new Date("2026-09-11T00:00:00+03:00"))).toEqual([{ from: 10, to: 10 }]);
  });

  it("база diff — коммит основной линии на момент отметки, а не более свежий по дате коммит слитой позже ветки", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "v1\n" });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    gitCheckout(repo, "fix", { create: true });
    await writeFile(join(repo, "src/a.ts"), "v2\n");
    gitCommitAll(repo, "Починить a", "2026-09-10T10:00:00+03:00");
    gitCheckout(repo, "master");
    gitMergeNoFastForward(repo, "fix", "2026-09-12T10:00:00+03:00");

    expect(await changedLines(repo, "src/a.ts", new Date("2026-09-11T10:00:00+03:00"))).toEqual([{ from: 1, to: 1 }]);
  });

  it("без коммитов до отметки возвращает null", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/upload.ts": "один\n" });
    gitCommitAll(repo, "Начало", "2026-09-12T10:00:00+03:00");

    expect(await changedLines(repo, "src/upload.ts", new Date("2026-09-10T00:00:00+03:00"))).toBeNull();
  });

  it("правки в двух местах одного гунка — два диапазона, как без контекста", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/upload.ts": `${lines(1, 30).join("\n")}\n` });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFile(join(repo, "src/upload.ts"), `${["новая первая", ...lines(3, 12), "вставка", "ещё вставка", ...lines(13, 30)].join("\n")}\n`);
    gitCommitAll(repo, "Правки рядом", "2026-09-12T10:00:00+03:00");

    expect(await changedLines(repo, "src/upload.ts", new Date("2026-09-11T00:00:00+03:00"))).toEqual([
      { from: 1, to: 1 },
      { from: 12, to: 13 },
    ]);
  });

  it("база и diff файла для одной отметки читаются из git один раз, текст и изменённые строки — из одного diff", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/upload.ts": "один\n" });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFile(join(repo, "src/upload.ts"), "два\n");
    gitCommitAll(repo, "Правка", "2026-09-12T10:00:00+03:00");
    const counting = countingGit();
    const diffOf = diffsSince(repo, counting.git);
    const since = new Date("2026-09-11T00:00:00+03:00");

    const [first, second] = await Promise.all([diffOf("src/upload.ts", since), diffOf("src/upload.ts", since)]);

    expect(first).toMatchObject({ excerpt: { text: expect.stringMatching(/-один\n\+два/), omittedLines: 0 }, changed: [{ from: 1, to: 1 }] });
    expect(second).toEqual(first);
    expect(counting.processes()).toBe(2);
  });
});
