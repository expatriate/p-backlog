import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { coreMessages } from "../messages";
import { readJournal } from "../store/journal";
import { loadBacklog } from "../store/load";
import { gitCheckout, gitCommitAll, gitMergeNoFastForward, makeGitRepo, makeTempDir, projectFile, writeFiles } from "../store/testing/temp-dirs";
import { makeGraph } from "../graph/testing/make-graph";
import { anchorOf } from "./anchor";
import { checkBacklog } from "./check-backlog";

const RU = coreMessages("ru");

const NOW = new Date("2026-09-18T12:00:00Z");

function task(id: string, fields = ""): string {
  return `---\nid: ${id}\ntitle: Задача ${id}\ncreated: 2026-09-11T10:00:00+03:00\n${fields}---\n`;
}

async function setup() {
  const home = await makeTempDir();
  const root = join(home, "backlog");
  const repo = await makeGitRepo(home, "projects/spa");
  await writeFiles(repo, { "src/upload.ts": "v1\n", "src/legacy.ts": "old\n", "src/queue.ts": "q\n" });
  gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
  await writeFile(join(repo, "src/upload.ts"), "v2\n");
  await rm(join(repo, "src/legacy.ts"));
  gitCommitAll(repo, "Таймаут от размера файла", "2026-09-12T10:00:00+03:00");

  await writeFiles(root, {
    "spa/project.md": projectFile("SPA", [repo]),
    "spa/SPA-1.md": task("SPA-1", "source: src/upload.ts:10\n"),
    "spa/SPA-2.md": task("SPA-2", "source: src/legacy.ts:5\n"),
    "spa/SPA-3.md": task("SPA-3", "source: src/queue.ts:1\n"),
    "spa/SPA-4.md": task("SPA-4").replace("Задача SPA-4", "Таймаут загрузки не учитывает размер файла"),
    "spa/SPA-5.md": task("SPA-5").replace("Задача SPA-5", '"Загрузка: таймаут не учитывает большие файлы"'),
    "spa/SPA-6.md": task("SPA-6", "status: in-progress\nsource: src/upload.ts:1\n"),
    "spa/SPA-7.md": task("SPA-7", "type: epic\n"),
    "spa/SPA-8.md": task("SPA-8", "epic: SPA-7\nstatus: done\nclosed: 2026-09-12T10:00:00+03:00\n"),
    "spa/SPA-9.md": task("SPA-9", "blockedBy: [SPA-99]\nrelated: [SPA-10]\n"),
    "spa/SPA-10.md": "сломано",
  });
  return { home, root, repo };
}

describe("checkBacklog", () => {
  it("нечитаемый журнал не роняет проверку: кандидаты есть, ошибка в stderr", async () => {
    const { home, root } = await setup();
    await rm(join(root, "spa", "journal.jsonl"), { force: true });
    await mkdir(join(root, "spa", "journal.jsonl"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU });

    expect(report.candidates.map((candidate) => candidate.task.id)).toContain("SPA-1");
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("Не удалось записать кандидатов"));
    errors.mockRestore();
  });

  it("сдвинутый фрагмент переносит source сам, задаче без якоря дописывает якорь, кандидатом не становится", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    const code = ["const one = 1;", "const two = 2;", "const three = 3;", "const four = 4;", "const five = 5;", "const six = 6;"].join("\n");
    await writeFiles(repo, { "src/a.ts": code, "src/b.ts": code });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA", [repo]),
      "spa/SPA-1.md": task("SPA-1", `source: src/a.ts:3\nanchor: ${anchorOf(code, "src/a.ts:3")}\n`),
      "spa/SPA-2.md": task("SPA-2", "source: src/b.ts:3\n"),
    });
    await writeFile(join(repo, "src/a.ts"), ["new1", "new2", code].join("\n"));
    gitCommitAll(repo, "Добавлены строки сверху", "2026-09-12T10:00:00+03:00");

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU });

    expect(report.candidates).toEqual([]);
    expect(report.fixed.map(RU.checkFix)).toEqual(["SPA-1: source сдвинулся :3 → :5"]);
    const tasks = (await loadBacklog(root)).tasks;
    const shifted = ["new1", "new2", code].join("\n");
    expect(tasks.find((item) => item.id === "SPA-1")).toMatchObject({ source: "src/a.ts:5", anchor: anchorOf(shifted, "src/a.ts:5") });
    expect(tasks.find((item) => item.id === "SPA-2")?.anchor).toBe(anchorOf(code, "src/b.ts:3"));
  });

  it("журнал помнит, как найден кандидат «код изменился»: по изменившимся строкам source или по файлу целиком", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    const code = ["const one = 1;", "const two = 2;", "const three = 3;", "const four = 4;", "const five = 5;", "const six = 6;"].join("\n");
    await writeFiles(repo, { "src/a.ts": code, "src/b.ts": code });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA", [repo]),
      "spa/SPA-1.md": task("SPA-1", `source: src/a.ts:3\nanchor: ${anchorOf(code, "src/a.ts:3")}\n`),
      "spa/SPA-2.md": task("SPA-2", "source: src/b.ts\n"),
    });
    await writeFiles(repo, { "src/a.ts": code.replace("three", "THREE"), "src/b.ts": code.replace("six", "SIX") });
    gitCommitAll(repo, "Правка", "2026-09-12T10:00:00+03:00");

    await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU });

    const candidates = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "candidate");
    expect(candidates).toEqual([
      expect.objectContaining({ task: "SPA-1", evidence: "source-changed", method: "anchor" }),
      expect.objectContaining({ task: "SPA-2", evidence: "source-changed", method: "file" }),
    ]);
  });

  async function symbolFixture(taskFields: (before: string) => string, edit: (code: string) => string) {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    const before = ["export function uploadFile() {", '  return "v1";', "}", "", "export function retry() {", '  return "v1";', "}", ""].join("\n");
    const after = edit(before);
    await writeFiles(repo, { "src/upload.ts": before });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", taskFields(before)) });
    await writeFile(join(repo, "src/upload.ts"), after);
    gitCommitAll(repo, "Правка", "2026-09-12T10:00:00+03:00");
    const hash = createHash("sha256").update(after).digest("hex");
    const symbols = [
      { name: "uploadFile", kind: "Function", from: 1, to: 3 },
      { name: "retry", kind: "Function", from: 5, to: 7 },
    ];
    await makeGraph(repo, [{ path: "src/upload.ts", hash, symbols }]);
    const anchorOfSpa1 = async () => (await loadBacklog(root)).tasks.find((item) => item.id === "SPA-1")?.anchor;
    return { home, root, after, anchorOfSpa1 };
  }

  const editRetry = (code: string) => code.replace('retry() {\n  return "v1"', 'retry() {\n  return "v2"');

  it("кандидата отбросил фильтр по символу — задача без якоря всё равно получает якорь", async () => {
    const { home, root, after, anchorOfSpa1 } = await symbolFixture(() => "source: src/upload.ts:2\n", editRetry);

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU });

    expect(report.candidates).toEqual([]);
    expect(await anchorOfSpa1()).toBe(anchorOf(after, "src/upload.ts:2"));
  });

  it("отсеянный графом кандидат записан в журнал с символом и не открывает эпизод кандидата", async () => {
    const { home, root } = await symbolFixture(() => "source: src/upload.ts:2\n", editRetry);

    await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU });

    const events = (await readJournal(join(root, "spa"), "spa")).events;
    expect(events.filter((event) => event.kind === "candidate-filtered")).toEqual([expect.objectContaining({ task: "SPA-1", symbol: "uploadFile" })]);
    expect(events.filter((event) => event.kind === "candidate")).toEqual([]);
  });

  async function shiftedFixture(taskFields: (before: string) => string, edit: (code: string) => string) {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    const before = ['import { a } from "a";', "", "export function alpha() {", '  return "alpha";', "}", "", "export function beta() {", '  return "v1";', "}", "", "export function gamma() {", '  return "gamma";', "}", ""].join("\n");
    const imports = ['import { b } from "b";', 'import { c } from "c";', 'import { d } from "d";', 'import { e } from "e";'];
    const after = [...imports, edit(before)].join("\n");
    await writeFiles(repo, { "src/code.ts": before });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", taskFields(before)) });
    await writeFile(join(repo, "src/code.ts"), after);
    gitCommitAll(repo, "Импорты и правка", "2026-09-12T10:00:00+03:00");
    const symbols = [
      { name: "alpha", kind: "Function", from: 7, to: 9 },
      { name: "beta", kind: "Function", from: 11, to: 13 },
      { name: "gamma", kind: "Function", from: 15, to: 17 },
    ];
    await makeGraph(repo, [{ path: "src/code.ts", hash: createHash("sha256").update(after).digest("hex"), symbols }]);
    const spa1 = async () => (await loadBacklog(root)).tasks.find((item) => item.id === "SPA-1");
    const check = async () => checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU });
    return { after, spa1, check };
  }

  const editBeta = (code: string) => code.replace('return "v1"', 'return "v2"');
  const editAlpha = (code: string) => code.replace('return "alpha"', 'return "ALPHA"');

  it("строки выше задачи и правка в её функции — кандидат остаётся, якорь не переезжает на соседнюю функцию", async () => {
    const { spa1, check } = await shiftedFixture((before) => `source: src/code.ts:8\nanchor: ${anchorOf(before, "src/code.ts:8")}\n`, editBeta);
    const anchorBefore = (await spa1())?.anchor;

    const report = await check();

    expect(report.candidates).toEqual([expect.objectContaining({ task: expect.objectContaining({ id: "SPA-1" }), method: "symbol", snippet: expect.stringContaining('   12│   return "v2";') })]);
    expect(await spa1()).toMatchObject({ source: "src/code.ts:8", anchor: anchorBefore });
  });

  it("строки выше задачи и правка рядом с ней, но вне её функции — кандидата нет, source переезжает на новое место задачи", async () => {
    const commentAboveBeta = (code: string) => code.replace("}\n\nexport function beta", "}\n// beta\nexport function beta");
    const { after, spa1, check } = await shiftedFixture((before) => `source: src/code.ts:8\nanchor: ${anchorOf(before, "src/code.ts:8")}\n`, commentAboveBeta);

    const report = await check();

    expect(report.candidates).toEqual([]);
    expect(report.fixed.map(RU.checkFix)).toEqual(["SPA-1: source сдвинулся :8 → :12"]);
    expect(await spa1()).toMatchObject({ source: "src/code.ts:12", anchor: anchorOf(after, "src/code.ts:12") });
  });

  it("задача без якоря, записанная по грязному файлу, — строку не переводим: кандидат остаётся, source не переезжает", async () => {
    const { spa1, check } = await shiftedFixture(() => "source: src/code.ts:12\n", editBeta);

    const report = await check();

    expect(report.candidates.map((candidate) => candidate.task.id)).toEqual(["SPA-1"]);
    expect(report.fixed).toEqual([]);
    expect((await spa1())?.source).toBe("src/code.ts:12");
  });

  it("якорь не совпадает с файлом на момент отметки — перевести строки нельзя: кандидат остаётся, якорь не трогается", async () => {
    const shiftedSource = (before: string) => {
      const moved = ['import { b } from "b";', 'import { c } from "c";', 'import { d } from "d";', 'import { e } from "e";', before].join("\n");
      return `source: src/code.ts:12\nanchor: ${anchorOf(moved, "src/code.ts:12")}\n`;
    };
    const { spa1, check } = await shiftedFixture(shiftedSource, editBeta);
    const anchorBefore = (await spa1())?.anchor;

    const report = await check();

    expect(report.candidates.map((candidate) => candidate.task.id)).toEqual(["SPA-1"]);
    expect((await spa1())?.anchor).toBe(anchorBefore);
  });

  it("правка, сделанная на ветке до создания задачи и слитая merge-коммитом после, делает задачу кандидатом", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    await writeFiles(repo, { "src/a.ts": "a1\n", "src/b.ts": "b1\n" });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    gitCheckout(repo, "fix", { create: true });
    await writeFile(join(repo, "src/a.ts"), "a2\n");
    gitCommitAll(repo, "Починить a", "2026-09-10T10:00:00+03:00");
    gitCheckout(repo, "master");
    await writeFile(join(repo, "src/b.ts"), "b2\n");
    gitCommitAll(repo, "Поправить b", "2026-09-10T12:00:00+03:00");
    gitMergeNoFastForward(repo, "fix", "2026-09-12T10:00:00+03:00");
    await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", "source: src/a.ts\n") });

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU });

    expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-changed", task: expect.objectContaining({ id: "SPA-1" }), commits: [expect.objectContaining({ subject: "Слить fix" })] })]);
  });

  it("журнал помнит, по какому признаку найден дубль", async () => {
    const { home, root } = await setup();

    await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });

    const duplicates = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "candidate" && event.evidence === "duplicate");
    expect(duplicates).toEqual([expect.objectContaining({ task: "SPA-5", match: "title" })]);
  });

  it("кандидата отбросил фильтр по символу — изменившийся якорь обновляется, повторно кандидата нет", async () => {
    const commentAbove = (code: string) => code.replace("}\n\nexport function retry", "}\n// повтор\nexport function retry");
    const { home, root, after, anchorOfSpa1 } = await symbolFixture((before) => `source: src/upload.ts:5\nanchor: ${anchorOf(before, "src/upload.ts:5")}\n`, commentAbove);

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU });

    expect(report.candidates).toEqual([]);
    expect(await anchorOfSpa1()).toBe(anchorOf(after, "src/upload.ts:5"));
  });

  it("кандидата фильтр по символу оставил — якорь не пишется, кандидат остаётся до разбора", async () => {
    const editUpload = (code: string) => code.replace('return "v1"', 'return "v2"');
    const { home, root, anchorOfSpa1 } = await symbolFixture(() => "source: src/upload.ts:2\n", editUpload);

    const first = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU });
    const second = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU });

    expect(first.candidates.map((candidate) => candidate.task.id)).toEqual(["SPA-1"]);
    expect(await anchorOfSpa1()).toBeUndefined();
    expect(second.candidates.map((candidate) => candidate.task.id)).toEqual(["SPA-1"]);
  });

  it("полный режим чинит данные, сообщает о проблемах и отдаёт кандидатов; при неразобранном файле эпики не закрывает", async () => {
    const { home, root } = await setup();

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });

    expect(report.fixed.map(RU.checkFix)).toEqual(["SPA-9: убраны ссылки на несуществующие задачи: SPA-99"]);
    expect(report.problems.map(RU.checkProblem)).toEqual([
      expect.stringMatching(/SPA-10\.md не разобран: файл не начинается с frontmatter/),
      "Эпики SPA-7 завершены, но не закроются, пока не исправлены неразобранные файлы",
    ]);
    expect(report.candidates).toEqual([
      {
        kind: "source-changed",
        task: { id: "SPA-1", title: "Задача SPA-1" },
        path: "src/upload.ts",
        commits: [{ sha: expect.stringMatching(/^[0-9a-f]{7,}$/), subject: "Таймаут от размера файла" }],
        uncommitted: false,
        method: "file",
        diff: expect.stringMatching(/-v1\n\+v2/),
      },
      { kind: "source-missing", task: { id: "SPA-2", title: "Задача SPA-2" }, path: "src/legacy.ts" },
      {
        kind: "duplicate",
        task: { id: "SPA-5", title: "Загрузка: таймаут не учитывает большие файлы" },
        other: { id: "SPA-4", title: "Таймаут загрузки не учитывает размер файла" },
        match: "title",
      },
    ]);

    const byId = new Map((await loadBacklog(root)).tasks.map((loaded) => [loaded.id, loaded]));
    expect(byId.get("SPA-7")?.status).toBe("backlog");
    expect(byId.get("SPA-9")).toMatchObject({ blockedBy: [], related: ["SPA-10"] });
  });

  it("полный режим закрывает завершённый эпик, когда все файлы разобраны", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-7.md": task("SPA-7", "type: epic\n"),
      "spa/SPA-8.md": task("SPA-8", "epic: SPA-7\nstatus: done\nclosed: 2026-09-12T10:00:00+03:00\n"),
    });

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });

    expect(report.fixed.map(RU.checkFix)).toEqual(["SPA-7: эпик закрыт — все задачи эпика закрыты: SPA-8"]);
    const epic = (await loadBacklog(root)).tasks.find((loaded) => loaded.id === "SPA-7");
    expect(epic).toMatchObject({ status: "done", resolution: "epic-done", reason: "все задачи эпика закрыты: SPA-8" });
  });

  it("закрытие эпика проверкой пишет в журнал событие от имени check", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-7.md": task("SPA-7", "type: epic\n"),
      "spa/SPA-8.md": task("SPA-8", "epic: SPA-7\nstatus: done\nclosed: 2026-09-12T10:00:00+03:00\n"),
    });

    await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });

    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toMatchObject([{ kind: "status", task: "SPA-7", to: "done", resolution: "epic-done", via: "check" }]);
  });

  it("узкий режим отдаёт только кандидатов по коду и не чинит ссылки и эпики", async () => {
    const { home, root } = await setup();

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU });

    expect(report.fixed.map(RU.checkFix)).toEqual([]);
    expect(report.problems.map(RU.checkProblem)).toEqual([]);
    expect(report.candidates.map((candidate) => [candidate.kind, candidate.task.id])).toEqual([
      ["source-changed", "SPA-1"],
      ["source-missing", "SPA-2"],
    ]);
    const byId = new Map((await loadBacklog(root)).tasks.map((loaded) => [loaded.id, loaded]));
    expect(byId.get("SPA-9")?.blockedBy).toEqual(["SPA-99"]);
    expect(byId.get("SPA-7")?.status).toBe("backlog");
  });

  it("полная проверка пишет кандидатов в журнал один раз до решения", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": task("SPA-1", "source: src/a.ts:1\n"),
      "spa/SPA-2.md": task("SPA-2", "source: src/a.ts:1\n"),
    });

    const first = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });
    await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });

    expect(first.candidates).toMatchObject([{ kind: "duplicate", task: { id: "SPA-2" }, other: { id: "SPA-1" } }]);
    const candidates = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "candidate");
    expect(candidates).toMatchObject([{ task: "SPA-2", evidence: "duplicate", mode: "full", via: "check" }]);
  });

  it("пока репозиторий недоступен, эпизоды кандидатов по коду не закрываются и потом не открываются заново", async () => {
    const { home, root, repo } = await setup();
    const full = async () => checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });

    await full();
    await rename(repo, `${repo}-away`);
    await full();
    await rename(`${repo}-away`, repo);
    await full();

    const events = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.task === "SPA-1" && event.kind !== "candidate-filtered");
    expect(events.map((event) => event.kind)).toEqual(["candidate"]);
  });

  it("три задачи с одним source — по одному кандидату duplicate на задачу, без повторов", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": task("SPA-1", "source: src/a.ts:1\n"),
      "spa/SPA-2.md": task("SPA-2", "source: src/a.ts:1\n"),
      "spa/SPA-3.md": task("SPA-3", "source: src/a.ts:1\n"),
    });

    await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });

    const candidates = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "candidate");
    expect(candidates).toMatchObject([
      { task: "SPA-2", evidence: "duplicate" },
      { task: "SPA-3", evidence: "duplicate" },
    ]);
  });

  it("полная проверка сообщает, что каталог проекта — не git-репозиторий или история git не читается", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const plain = join(home, "projects/plain");
    await writeFiles(plain, { "src/a.ts": "a\n" });
    const broken = await makeGitRepo(home, "projects/broken");
    await writeFiles(broken, { "src/b.ts": "b\n" });
    gitCommitAll(broken, "Начало", "2026-09-10T10:00:00+03:00");
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: broken, encoding: "utf8" }).trim();
    await rm(join(broken, ".git/objects", head.slice(0, 2), head.slice(2)));
    await writeFiles(root, {
      "pl/project.md": projectFile("PL", [plain]),
      "pl/PL-1.md": task("PL-1", "source: src/a.ts:1\n"),
      "br/project.md": projectFile("BR", [broken]),
      "br/BR-1.md": task("BR-1", "source: src/b.ts:1\n"),
    });

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["pl", "br"], mode: "full", now: NOW, home, messages: RU });

    expect(report.problems).toEqual(
      expect.arrayContaining([
        { kind: "project-repo-not-git", projectId: "pl", repo: plain },
        { kind: "project-history-unreadable", projectId: "br", repo: broken },
      ]),
    );
  });

  it("сообщает о проекте без репозитория и проверяет только выбранные проекты", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, {
      "ti/project.md": projectFile("TI", [join(home, "нет-такого")]),
      "ti/TI-1.md": task("TI-1", "source: src/a.ts:1\n"),
      "docs/project.md": projectFile("DOC"),
      "docs/DOC-1.md": "сломано",
    });

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["ti"], mode: "full", now: NOW, home, messages: RU });

    expect(report.problems.map(RU.checkProblem)).toEqual([expect.stringMatching(/^Проект ti: ни один путь из repos не существует/)]);
    expect(report.candidates).toEqual([]);
  });

  it("ссылки на задачи проекта, который не загрузился, и на неизвестный префикс не трогает, а о его project.md сообщает", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": task("SPA-1", "blockedBy: [SPA-99]\nrelated: [TI-3, XYZ-1]\n"),
      "ti/project.md": "сломано",
      "ti/TI-3.md": task("TI-3"),
    });

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });

    expect(report.fixed.map(RU.checkFix)).toEqual(["SPA-1: убраны ссылки на несуществующие задачи: SPA-99"]);
    expect(report.problems.map(RU.checkProblem)).toContainEqual(expect.stringContaining(`${join("ti", "project.md")} не разобран`));
    const spa1 = (await loadBacklog(root)).tasks.find((loaded) => loaded.id === "SPA-1");
    expect(spa1).toMatchObject({ blockedBy: [], related: ["TI-3", "XYZ-1"] });
  });

  it("сообщает о проектах с одним префиксом: их ID задач пересекаются", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa-2/project.md": projectFile("SPA"), "ti/project.md": projectFile("TI") });

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });

    expect(report.problems).toContainEqual({ kind: "prefix-shared", prefix: "SPA", projectIds: ["spa", "spa-2"] });
  });

  it("посторонний каталог и чужие ошибки не мешают закрыть эпик, свой неразобранный файл мешает", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-7.md": task("SPA-7", "type: epic\n"),
      "spa/SPA-8.md": task("SPA-8", "epic: SPA-7\nstatus: done\nclosed: 2026-09-12T10:00:00+03:00\n"),
      "docs/project.md": projectFile("DOC"),
      "docs/DOC-1.md": "сломано",
      "notes/todo.md": "заметки",
    });

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });

    expect(report.fixed.map(RU.checkFix)).toEqual(["SPA-7: эпик закрыт — все задачи эпика закрыты: SPA-8"]);
    expect(report.problems.map(RU.checkProblem)).toEqual([expect.stringMatching(/^Проект spa: в repos нет путей/)]);

    await writeFiles(root, { "spa/SPA-9.md": "сломано" });
    const blocked = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU });

    expect(blocked.problems.map(RU.checkProblem)).toContainEqual(expect.stringContaining(`${join("spa", "SPA-9.md")} не разобран`));
  });
});
