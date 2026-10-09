import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { CheckMode } from "../journal/events";
import { coreMessages } from "../messages";
import { readJournal } from "../store/journal";
import { loadBacklog } from "../store/load";
import {
  gitCheckout,
  gitCommitAll,
  gitMergeFastForward,
  gitMergeNoFastForward,
  gitMergeSquash,
  gitRebaseMerge,
  gitShortHead,
  makeGitRepo,
  makeTempDir,
  projectFile,
  taskFile,
  writeFiles,
} from "../store/testing/temp-dirs";
import { makeGraphDb } from "../code-review-graph/testing/make-graph-db";
import { anchorOf } from "./anchor";
import { checkBacklog, type CheckReport } from "./check-backlog";

const RU = coreMessages("ru");

const NOW = new Date("2026-09-18T12:00:00Z");

const ignoreWarning = () => undefined;

async function check(root: string, home: string, mode: CheckMode, projectIds: readonly string[] = ["spa"]) {
  return checkBacklog(root, await loadBacklog(root), { projectIds, mode, now: NOW, home, messages: RU, warn: ignoreWarning });
}

function task(id: string, fields = ""): string {
  return `---\nid: ${id}\ntitle: Задача ${id}\ncreated: 2026-09-11T10:00:00+03:00\n${fields}---\n`;
}

function numbered(name: string): string {
  return [1, 2, 3, 4, 5, 6, 7, 8].map((index) => `export const ${name}${index} = ${index};`).join("\n");
}

function sameProblemTask(id: string, fields = ""): string {
  return task(id, fields).replace(`Задача ${id}`, "Таймаут загрузки не учитывает размер файла");
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
    "spa/SPA-4.md": sameProblemTask("SPA-4"),
    "spa/SPA-5.md": task("SPA-5").replace("Задача SPA-5", '"Загрузка: таймаут не учитывает размер файла"'),
    "spa/SPA-6.md": task("SPA-6", "status: in-progress\nsource: src/upload.ts:1\n"),
    "spa/SPA-7.md": task("SPA-7", "type: epic\n"),
    "spa/SPA-8.md": task("SPA-8", "epic: SPA-7\nstatus: done\nclosed: 2026-09-12T10:00:00+03:00\n"),
    "spa/SPA-9.md": task("SPA-9", "blockedBy: [SPA-99]\nrelated: [SPA-10]\n"),
    "spa/SPA-10.md": "сломано",
  });
  return { home, root, repo };
}

describe("checkBacklog", () => {
  it.skipIf(process.platform === "win32")("нечитаемый source пропускает только свою задачу: остальные кандидаты есть, путь в предупреждении (на Windows chmod не запрещает чтение)", async () => {
    const { home, root, repo } = await setup();
    const unreadable = join(repo, "src/queue.ts");
    await writeFile(unreadable, "q2\n");
    gitCommitAll(repo, "Очередь", "2026-09-13T10:00:00+03:00");
    await chmod(unreadable, 0o000);
    onTestFinished(() => chmod(unreadable, 0o600));
    const warnings: string[] = [];

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "full", now: NOW, home, messages: RU, warn: (line) => warnings.push(line) });

    const candidates = report.candidates.map((candidate) => candidate.task.id);
    expect(candidates).toEqual(expect.arrayContaining(["SPA-1", "SPA-2"]));
    expect(candidates).not.toContain("SPA-3");
    expect(warnings).toEqual([expect.stringContaining(unreadable)]);
  });

  it.skipIf(process.platform === "win32")("нечитаемый source старшей из пары дублей не снимает кандидата с младшей и не закрывает её эпизод (на Windows chmod не запрещает чтение)", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    await writeFiles(repo, { "src/a.ts": "a\n", "src/b.ts": "b\n" });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": sameProblemTask("SPA-1", "source: src/a.ts:1\n"), "spa/SPA-2.md": sameProblemTask("SPA-2", "source: src/b.ts:1\n") });
    const duplicates = (report: CheckReport) => report.candidates.map((candidate) => [candidate.kind, candidate.task.id]);
    expect(duplicates(await check(root, home, "full"))).toEqual([["duplicate", "SPA-2"]]);
    const locked = join(repo, "src/a.ts");
    await chmod(locked, 0o000);
    onTestFinished(() => chmod(locked, 0o600));

    const report = await check(root, home, "full");

    expect(duplicates(report)).toEqual([["duplicate", "SPA-2"]]);
    expect((await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "candidate-gone")).toEqual([]);
  });

  it("нечитаемый журнал не роняет проверку: кандидаты есть, ошибка в stderr", async () => {
    const { home, root } = await setup();
    await rm(join(root, "spa", "journal.jsonl"), { force: true });
    await mkdir(join(root, "spa", "journal.jsonl"));
    const warnings: string[] = [];

    const report = await checkBacklog(root, await loadBacklog(root), { projectIds: ["spa"], mode: "changed", now: NOW, home, messages: RU, warn: (line) => warnings.push(line) });

    expect(report.candidates.map((candidate) => candidate.task.id)).toContain("SPA-1");
    expect(warnings).toEqual([expect.stringContaining("Не удалось прочитать журнал spa"), expect.stringContaining("Не удалось записать кандидатов")]);
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

    const report = await check(root, home, "changed");

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

    await check(root, home, "changed");

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
    await makeGraphDb(repo, [{ path: "src/upload.ts", hash, symbols }]);
    const anchorOfSpa1 = async () => (await loadBacklog(root)).tasks.find((item) => item.id === "SPA-1")?.anchor;
    return { home, root, after, anchorOfSpa1 };
  }

  const editRetry = (code: string) => code.replace('retry() {\n  return "v1"', 'retry() {\n  return "v2"');

  it("кандидата отбросил фильтр по символу — задача без якоря всё равно получает якорь", async () => {
    const { home, root, after, anchorOfSpa1 } = await symbolFixture(() => "source: src/upload.ts:2\n", editRetry);

    const report = await check(root, home, "changed");

    expect(report.candidates).toEqual([]);
    expect(await anchorOfSpa1()).toBe(anchorOf(after, "src/upload.ts:2"));
  });

  it("отсеянный графом кандидат записан в журнал с символом и не открывает эпизод кандидата", async () => {
    const { home, root } = await symbolFixture(() => "source: src/upload.ts:2\n", editRetry);

    await check(root, home, "changed");

    const events = (await readJournal(join(root, "spa"), "spa")).events;
    expect(events.filter((event) => event.kind === "candidate-filtered")).toEqual([expect.objectContaining({ task: "SPA-1", symbol: "uploadFile" })]);
    expect(events.filter((event) => event.kind === "candidate")).toEqual([]);
  });

  it("отсев того же символа в уже открытом эпизоде не пишет повторного события", async () => {
    const { home, root } = await symbolFixture(() => "source: src/upload.ts:2\n", editRetry);
    const opened = { at: "2026-09-11T10:00:00+03:00", task: "SPA-1", via: "check", kind: "candidate-filtered", symbol: "uploadFile" };
    await writeFile(join(root, "spa", "journal.jsonl"), `${JSON.stringify(opened)}\n`);

    await check(root, home, "changed");

    const events = (await readJournal(join(root, "spa"), "spa")).events;
    expect(events.filter((event) => event.kind === "candidate-filtered")).toHaveLength(1);
  });

  async function shiftedFixture(taskFields: (before: string) => string, edit: (code: string) => string) {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    const before = [
      'import { a } from "a";',
      "",
      "export function alpha() {",
      '  return "alpha";',
      "}",
      "",
      "export function beta() {",
      '  return "v1";',
      "}",
      "",
      "export function gamma() {",
      '  return "gamma";',
      "}",
      "",
    ].join("\n");
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
    await makeGraphDb(repo, [{ path: "src/code.ts", hash: createHash("sha256").update(after).digest("hex"), symbols }]);
    const spa1 = async () => (await loadBacklog(root)).tasks.find((item) => item.id === "SPA-1");
    return { root, home, after, spa1 };
  }

  const editBeta = (code: string) => code.replace('return "v1"', 'return "v2"');

  it("строки выше задачи и правка в её функции — кандидат остаётся, якорь не переезжает на соседнюю функцию", async () => {
    const { root, home, spa1 } = await shiftedFixture((before) => `source: src/code.ts:8\nanchor: ${anchorOf(before, "src/code.ts:8")}\n`, editBeta);
    const anchorBefore = (await spa1())?.anchor;

    const report = await check(root, home, "changed");

    expect(report.candidates).toEqual([
      expect.objectContaining({ task: expect.objectContaining({ id: "SPA-1" }), method: "symbol", source: "src/code.ts:12", snippet: expect.stringContaining('   12│   return "v2";') }),
    ]);
    expect(await spa1()).toMatchObject({ source: "src/code.ts:8", anchor: anchorBefore });
  });

  it("строки выше задачи и правка рядом с ней, но вне её функции — кандидата нет, source переезжает на новое место задачи", async () => {
    const commentAboveBeta = (code: string) => code.replace("}\n\nexport function beta", "}\n// beta\nexport function beta");
    const { root, home, after, spa1 } = await shiftedFixture((before) => `source: src/code.ts:8\nanchor: ${anchorOf(before, "src/code.ts:8")}\n`, commentAboveBeta);

    const report = await check(root, home, "changed");

    expect(report.candidates).toEqual([]);
    expect(report.fixed.map(RU.checkFix)).toEqual(["SPA-1: source сдвинулся :8 → :12"]);
    expect(await spa1()).toMatchObject({ source: "src/code.ts:12", anchor: anchorOf(after, "src/code.ts:12") });
  });

  it("задача без якоря, записанная по грязному файлу, — строку не переводим: кандидат остаётся, source не переезжает", async () => {
    const { root, home, spa1 } = await shiftedFixture(() => "source: src/code.ts:12\n", editBeta);

    const report = await check(root, home, "changed");

    expect(report.candidates.map((candidate) => candidate.task.id)).toEqual(["SPA-1"]);
    expect(report.fixed).toEqual([]);
    expect((await spa1())?.source).toBe("src/code.ts:12");
  });

  it("якорь найден в файле на момент отметки только со сдвигом, строки задачи изменились — кандидат остаётся, якорь не трогается", async () => {
    const shiftedSource = (before: string) => {
      const moved = ['import { b } from "b";', 'import { c } from "c";', 'import { d } from "d";', 'import { e } from "e";', before].join("\n");
      return `source: src/code.ts:12\nanchor: ${anchorOf(moved, "src/code.ts:12")}\n`;
    };
    const { root, home, spa1 } = await shiftedFixture(shiftedSource, editBeta);
    const anchorBefore = (await spa1())?.anchor;

    const report = await check(root, home, "changed");

    expect(report.candidates.map((candidate) => candidate.task.id)).toEqual(["SPA-1"]);
    expect((await spa1())?.anchor).toBe(anchorBefore);
  });

  describe("кандидат «код изменился» по якорю — только когда менялись строки задачи", () => {
    async function anchoredRepo() {
      const home = await makeTempDir();
      const root = join(home, "backlog");
      const repo = await makeGitRepo(home, "projects/spa");
      const spa1 = async () => (await loadBacklog(root)).tasks.find((item) => item.id === "SPA-1");
      return { home, root, repo, spa1 };
    }

    it("на старой ветке без правок задачи после отметки кандидата нет и якорь прежний — правка строк задачи после возврата остаётся кандидатом", async () => {
      const { home, root, repo, spa1 } = await anchoredRepo();
      const before = numbered("a");
      await writeFiles(repo, { "src/a.ts": before });
      gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
      gitCheckout(repo, "old", { create: true });
      gitCheckout(repo, "master");
      const verified = before.replace("a3 = 3", "a3 = 33");
      await writeFiles(repo, { "src/a.ts": verified });
      gitCommitAll(repo, "Правка строки задачи", "2026-09-10T10:00:00+03:00");
      await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", `source: src/a.ts:3\nanchor: ${anchorOf(verified, "src/a.ts:3")}\n`) });

      gitCheckout(repo, "old");
      const onOldBranch = await check(root, home, "changed");
      const anchorOnOldBranch = (await spa1())?.anchor;
      gitCheckout(repo, "master");
      await writeFiles(repo, { "src/a.ts": verified.replace("a3 = 33", "a3 = 333") });
      gitCommitAll(repo, "Снова правка строки задачи", "2026-09-13T10:00:00+03:00");
      const backOnMaster = await check(root, home, "changed");

      expect(onOldBranch.candidates).toEqual([]);
      expect(anchorOnOldBranch).toBe(anchorOf(verified, "src/a.ts:3"));
      expect(backOnMaster.candidates).toEqual([expect.objectContaining({ kind: "source-changed", task: expect.objectContaining({ id: "SPA-1" }), method: "anchor" })]);
    });

    it("задача заведена по незакоммиченной правке, строки задачи потом изменил коммит — кандидат", async () => {
      const { home, root, repo } = await anchoredRepo();
      const committed = numbered("a");
      await writeFiles(repo, { "src/a.ts": committed });
      gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
      const dirty = committed.replace("a3 = 3", "a3 = 30");
      await writeFiles(repo, { "src/a.ts": dirty });
      await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", `source: src/a.ts:3\nanchor: ${anchorOf(dirty, "src/a.ts:3")}\n`) });
      gitCommitAll(repo, "Правка, по которой заведена задача", "2026-09-11T12:00:00+03:00");
      await writeFiles(repo, { "src/a.ts": dirty.replace("a3 = 30", "a3 = 300") });
      gitCommitAll(repo, "Правка строки задачи", "2026-09-12T10:00:00+03:00");

      const report = await check(root, home, "changed");

      expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-changed", task: expect.objectContaining({ id: "SPA-1" }), method: "anchor" })]);
    });

    it("правка строк задачи, сделанная на ветке до отметки и влитая перемоткой после, — кандидат", async () => {
      const { home, root, repo } = await anchoredRepo();
      const before = numbered("a");
      await writeFiles(repo, { "src/a.ts": before });
      gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
      gitCheckout(repo, "feat", { create: true, at: "2026-09-09T11:00:00+03:00" });
      await writeFiles(repo, { "src/a.ts": before.replace("a3 = 3", "a3 = 33") });
      gitCommitAll(repo, "Правка строки задачи на ветке", "2026-09-10T10:00:00+03:00");
      gitCheckout(repo, "master", { at: "2026-09-10T11:00:00+03:00" });
      await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", `source: src/a.ts:3\nanchor: ${anchorOf(before, "src/a.ts:3")}\n`) });
      gitMergeFastForward(repo, "feat", "2026-09-12T10:00:00+03:00");

      const report = await check(root, home, "changed");

      expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-changed", task: expect.objectContaining({ id: "SPA-1" }), method: "anchor" })]);
    });

    it("задача заведена по незакоммиченной правке, её строку правят снова до коммита — кандидат и до коммита, и после", async () => {
      const { home, root, repo } = await anchoredRepo();
      const committed = numbered("a");
      await writeFiles(repo, { "src/a.ts": committed });
      gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
      const dirty = committed.replace("a3 = 3", "a3 = 30");
      await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", `source: src/a.ts:3\nanchor: ${anchorOf(dirty, "src/a.ts:3")}\n`) });
      await writeFiles(repo, { "src/a.ts": dirty.replace("a3 = 30", "a3 = 300") });

      const beforeCommit = await check(root, home, "changed");
      gitCommitAll(repo, "Правка строки задачи", "2026-09-12T10:00:00+03:00");
      const afterCommit = await check(root, home, "changed");

      const candidate = [expect.objectContaining({ kind: "source-changed", task: expect.objectContaining({ id: "SPA-1" }), method: "anchor" })];
      expect({ beforeCommit: beforeCommit.candidates, afterCommit: afterCommit.candidates }).toEqual({ beforeCommit: candidate, afterCommit: candidate });
    });

    it("незакоммиченную правку, по которой заведена задача, откатили — кандидат", async () => {
      const { home, root, repo } = await anchoredRepo();
      const committed = numbered("a");
      await writeFiles(repo, { "src/a.ts": committed });
      gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
      const dirty = committed.replace("a3 = 3", "a3 = 30");
      await writeFiles(repo, { "src/a.ts": dirty });
      await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", `source: src/a.ts:3\nanchor: ${anchorOf(dirty, "src/a.ts:3")}\n`) });
      execFileSync("git", ["checkout", "--", "src/a.ts"], { cwd: repo });

      const report = await check(root, home, "changed");

      expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-changed", task: expect.objectContaining({ id: "SPA-1" }), method: "anchor" })]);
    });

    it("ветку, где проверена задача, влили squash-слиянием вместе с поздней правкой строки задачи — кандидат", async () => {
      const { home, root, repo } = await anchoredRepo();
      const before = numbered("a");
      await writeFiles(repo, { "src/a.ts": before });
      gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
      gitCheckout(repo, "feat", { create: true, at: "2026-09-09T11:00:00+03:00" });
      const verified = before.replace("a3 = 3", "a3 = 30");
      await writeFiles(repo, { "src/a.ts": verified });
      gitCommitAll(repo, "Правка строки задачи на ветке", "2026-09-10T10:00:00+03:00");
      await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", `source: src/a.ts:3\nanchor: ${anchorOf(verified, "src/a.ts:3")}\n`) });
      await writeFiles(repo, { "src/a.ts": verified.replace("a3 = 30", "a3 = 300") });
      gitCommitAll(repo, "Снова правка строки задачи на ветке", "2026-09-12T10:00:00+03:00");
      gitCheckout(repo, "master", { at: "2026-09-13T09:00:00+03:00" });
      gitMergeSquash(repo, "feat");
      gitCommitAll(repo, "Слить feat одним коммитом", "2026-09-13T10:00:00+03:00");

      const report = await check(root, home, "changed");

      expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-changed", task: expect.objectContaining({ id: "SPA-1" }), method: "anchor" })]);
    });

    it("строку вставили между строками задачи или правят край окна в две строки вокруг них — кандидат", async () => {
      const { home, root, repo } = await anchoredRepo();
      const before = numbered("a");
      await writeFiles(repo, { "src/a.ts": before, "src/b.ts": numbered("b") });
      gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
      await writeFiles(root, {
        "spa/project.md": projectFile("SPA", [repo]),
        "spa/SPA-1.md": task("SPA-1", `source: src/a.ts:3-5\nanchor: ${anchorOf(before, "src/a.ts:3-5")}\n`),
        "spa/SPA-2.md": task("SPA-2", `source: src/b.ts:3\nanchor: ${anchorOf(numbered("b"), "src/b.ts:3")}\n`),
      });
      await writeFiles(repo, { "src/a.ts": before.replace("export const a4", "export const guard = true;\nexport const a4"), "src/b.ts": numbered("b").replace("b5 = 5", "b5 = 50") });
      gitCommitAll(repo, "Вставка и правка рядом", "2026-09-12T10:00:00+03:00");

      const report = await check(root, home, "changed");

      expect(report.candidates.map((candidate) => [candidate.task.id, candidate.kind === "source-changed" ? candidate.method : null])).toEqual([
        ["SPA-1", "anchor"],
        ["SPA-2", "anchor"],
      ]);
    });

    it("строки задачи целы, фрагмент повторяется в файле и сдвинулся — кандидата нет, source переезжает", async () => {
      const { home, root, repo, spa1 } = await anchoredRepo();
      const block = numbered("a");
      const before = [block, block].join("\n");
      await writeFiles(repo, { "src/a.ts": before });
      gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
      await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", `source: src/a.ts:12\nanchor: ${anchorOf(before, "src/a.ts:12")}\n`) });
      const after = ["export const top = 0;", before].join("\n");
      await writeFiles(repo, { "src/a.ts": after });
      gitCommitAll(repo, "Строка сверху", "2026-09-12T10:00:00+03:00");

      const report = await check(root, home, "changed");

      expect(report.candidates).toEqual([]);
      expect(await spa1()).toMatchObject({ source: "src/a.ts:13", anchor: anchorOf(after, "src/a.ts:13") });
    });
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

    const report = await check(root, home, "changed");

    expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-changed", task: expect.objectContaining({ id: "SPA-1" }), commits: [expect.objectContaining({ subject: "Слить fix" })] })]);
  });

  type BranchLanding = "merge-commit" | "squash" | "rebase";

  async function featRepo() {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    await writeFiles(repo, { "src/a.ts": "a1\n", "src/b.ts": "b1\n" });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    gitCheckout(repo, "feat", { create: true });
    await writeFile(join(repo, "src/a.ts"), "a2\n");
    gitCommitAll(repo, "Фича правит a", "2026-09-10T10:00:00+03:00");
    return { home, root, repo };
  }

  async function landFeat(repo: string, landing: BranchLanding): Promise<void> {
    gitCheckout(repo, "master");
    await writeFile(join(repo, "src/b.ts"), "b2\n");
    gitCommitAll(repo, "main правит b", "2026-09-10T12:00:00+03:00");
    const at = "2026-09-12T10:00:00+03:00";
    if (landing === "merge-commit") gitMergeNoFastForward(repo, "feat", at);
    else if (landing === "rebase") gitRebaseMerge(repo, "feat", at);
    else {
      gitMergeSquash(repo, "feat");
      gitCommitAll(repo, "Слить feat одним коммитом", at);
    }
  }

  const createdOnFeat = (id: string, at: string, commit: string) => ({
    at,
    task: id,
    via: "cli",
    kind: "created",
    type: "task",
    priority: "medium",
    tags: [],
    source: "src/a.ts",
    origin: { branch: "feat", commit },
  });

  async function taskCreatedOnBranch({ branchEditAfterCreation, landing = "merge-commit" }: { branchEditAfterCreation: boolean; landing?: BranchLanding }) {
    const { home, root, repo } = await featRepo();
    const created = createdOnFeat("SPA-1", "2026-09-11T10:00:00+03:00", gitShortHead(repo));
    await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", "source: src/a.ts\n"), "spa/journal.jsonl": `${JSON.stringify(created)}\n` });
    if (branchEditAfterCreation) {
      await writeFile(join(repo, "src/a.ts"), "a3\n");
      gitCommitAll(repo, "Фича снова правит a", "2026-09-11T12:00:00+03:00");
    }
    await landFeat(repo, landing);
    return check(root, home, "changed");
  }

  it.each(["merge-commit", "squash", "rebase"] as const)("задача, заведённая на ветке после её правки, не становится кандидатом, когда ветку влили через %s", async (landing) => {
    const report = await taskCreatedOnBranch({ branchEditAfterCreation: false, landing });

    expect(report.candidates).toEqual([]);
  });

  it.each([
    { landing: "squash", landedEdit: "Слить feat одним коммитом" },
    { landing: "rebase", landedEdit: "Фича снова правит a" },
  ] as const)("ветку влили через $landing — кандидатом задачу делают правки source, которых не было в её коммите создания, включая правку после слияния", async ({ landing, landedEdit }) => {
    const { home, root, repo } = await featRepo();
    const beforeSecondEdit = createdOnFeat("SPA-1", "2026-09-11T10:00:00+03:00", gitShortHead(repo));
    await writeFile(join(repo, "src/a.ts"), "a3\n");
    gitCommitAll(repo, "Фича снова правит a", "2026-09-11T12:00:00+03:00");
    const afterSecondEdit = createdOnFeat("SPA-2", "2026-09-11T13:00:00+03:00", gitShortHead(repo));
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA", [repo]),
      "spa/SPA-1.md": task("SPA-1", "source: src/a.ts\n"),
      "spa/SPA-2.md": taskFile("SPA-2", { created: "2026-09-11T13:00:00+03:00", source: "src/a.ts" }),
      "spa/journal.jsonl": `${JSON.stringify(beforeSecondEdit)}\n${JSON.stringify(afterSecondEdit)}\n`,
    });
    await landFeat(repo, landing);
    await writeFile(join(repo, "src/a.ts"), "a4\n");
    gitCommitAll(repo, "Правка a после слияния", "2026-09-13T10:00:00+03:00");

    const report = await check(root, home, "changed");

    expect(report.candidates.map((candidate) => [candidate.task.id, candidate.kind === "source-changed" ? candidate.commits.map((commit) => commit.subject) : []])).toEqual([
      ["SPA-1", ["Правка a после слияния", landedEdit]],
      ["SPA-2", ["Правка a после слияния"]],
    ]);
  });

  it("правка ветки после создания задачи, пришедшая merge-коммитом, делает задачу кандидатом", async () => {
    const report = await taskCreatedOnBranch({ branchEditAfterCreation: true });

    expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-changed", commits: expect.arrayContaining([expect.objectContaining({ subject: "Слить feat" })]) })]);
  });

  it("файла задачи нет только в текущей ветке — кандидата «файл пропал» нет", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    await writeFiles(repo, { "src/a.ts": "a1\n" });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    gitCheckout(repo, "feat", { create: true });
    await writeFiles(repo, { "src/n.ts": "n1\n" });
    gitCommitAll(repo, "Фича добавляет n", "2026-09-10T10:00:00+03:00");
    await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", "source: src/n.ts:1\n") });
    gitCheckout(repo, "master");

    const report = await check(root, home, "changed");

    expect(report.candidates).toEqual([]);
  });

  it("файл удалён в этой ветке — коммитом после отметки, коммитом до подтверждения задачи или в рабочем дереве — или никогда не был в git: кандидат «файл пропал»", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    await writeFiles(repo, { "src/deleted.ts": "d1\n", "src/dirty.ts": "w1\n" });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    await rm(join(repo, "src/deleted.ts"));
    gitCommitAll(repo, "Удалить deleted", "2026-09-12T10:00:00+03:00");
    await rm(join(repo, "src/dirty.ts"));
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA", [repo]),
      "spa/SPA-1.md": task("SPA-1", "source: src/deleted.ts:1\n"),
      "spa/SPA-2.md": task("SPA-2", "source: src/dirty.ts:1\n"),
      "spa/SPA-3.md": task("SPA-3", "source: src/never.ts:1\n"),
      "spa/SPA-4.md": task("SPA-4", "source: src/deleted.ts:1\nverified: 2026-09-13T10:00:00+03:00\n"),
    });

    const report = await check(root, home, "changed");

    expect(report.candidates.map((candidate) => [candidate.kind, candidate.task.id])).toEqual([
      ["source-missing", "SPA-1"],
      ["source-missing", "SPA-2"],
      ["source-missing", "SPA-3"],
      ["source-missing", "SPA-4"],
    ]);
  });

  it("удаление коммитом с датой до отметки, влитое перемоткой после неё, — кандидат «файл пропал»", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    await writeFiles(repo, { "src/a.ts": "a1\n" });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    gitCheckout(repo, "feat", { create: true });
    await rm(join(repo, "src/a.ts"));
    gitCommitAll(repo, "Удалить a", "2026-09-10T10:00:00+03:00");
    gitCheckout(repo, "master");
    await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", "source: src/a.ts:1\n") });
    gitMergeFastForward(repo, "feat", "2026-09-12T10:00:00+03:00");

    const report = await check(root, home, "changed");

    expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-missing", task: expect.objectContaining({ id: "SPA-1" }) })]);
  });

  it("файл переименован: строки задачи целы, на месте или со сдвигом, — source переезжает сам, строки изменились — кандидат «файл пропал» с новым именем", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    await writeFiles(repo, { "src/intact.ts": numbered("intact"), "src/edited.ts": numbered("edited"), "src/shifted.ts": numbered("shifted") });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA", [repo]),
      "spa/SPA-1.md": task("SPA-1", `source: src/intact.ts:3\nanchor: ${anchorOf(numbered("intact"), "src/intact.ts:3")}\n`),
      "spa/SPA-2.md": task("SPA-2", `source: src/edited.ts:3\nanchor: ${anchorOf(numbered("edited"), "src/edited.ts:3")}\n`),
      "spa/SPA-3.md": task("SPA-3", `source: src/shifted.ts:3\nanchor: ${anchorOf(numbered("shifted"), "src/shifted.ts:3")}\n`),
    });
    await rm(join(repo, "src/intact.ts"));
    await rm(join(repo, "src/edited.ts"));
    await rm(join(repo, "src/shifted.ts"));
    await writeFiles(repo, {
      "src/renamed.ts": numbered("intact"),
      "src/reworked.ts": numbered("edited").replace("edited3 = 3", "edited3 = 30"),
      "src/moved.ts": ["// a", "// b", numbered("shifted")].join("\n"),
    });
    gitCommitAll(repo, "Переименовать", "2026-09-12T10:00:00+03:00");

    const report = await check(root, home, "changed");

    expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-missing", task: expect.objectContaining({ id: "SPA-2" }), renamedTo: "src/reworked.ts" })]);
    expect(report.fixed.map(RU.checkFix)).toEqual(["SPA-1: файл задачи переименован, source src/intact.ts:3 → src/renamed.ts:3", "SPA-3: файл задачи переименован, source src/shifted.ts:3 → src/moved.ts:5"]);
    const sources = (await loadBacklog(root)).tasks.map((item) => [item.id, item.source]);
    expect(sources).toEqual(
      expect.arrayContaining([
        ["SPA-1", "src/renamed.ts:3"],
        ["SPA-3", "src/moved.ts:5"],
      ]),
    );
  });

  it("дубль задачи не слитой ветки показан и записан в журнал, хотя её кандидаты по коду ждут слияния", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    await writeFiles(repo, { "src/a.ts": "a1\n" });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    gitCheckout(repo, "feat", { create: true });
    await writeFiles(repo, { "src/n.ts": "n1\n" });
    gitCommitAll(repo, "Фича добавляет n", "2026-09-10T10:00:00+03:00");
    const origin = { branch: "feat", commit: gitShortHead(repo) };
    gitCheckout(repo, "master");
    const created = (id: string) => JSON.stringify({ at: "2026-09-11T10:00:00+03:00", task: id, via: "cli", kind: "created", type: "task", priority: "medium", tags: [], source: "src/n.ts:1", origin });
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA", [repo]),
      "spa/SPA-1.md": sameProblemTask("SPA-1", "source: src/n.ts:1\n"),
      "spa/SPA-2.md": sameProblemTask("SPA-2", "source: src/n.ts:1\n"),
      "spa/journal.jsonl": `${created("SPA-1")}\n${created("SPA-2")}\n`,
    });

    const report = await check(root, home, "full");

    expect(report.candidates).toMatchObject([{ kind: "duplicate", task: { id: "SPA-2" }, other: { id: "SPA-1" } }]);
    const recorded = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind !== "created");
    expect(recorded).toMatchObject([{ kind: "candidate", task: "SPA-2", evidence: "duplicate" }]);
  });

  it("журнал помнит, по какому признаку найден дубль", async () => {
    const { home, root } = await setup();

    await check(root, home, "full");

    const duplicates = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "candidate" && event.evidence === "duplicate");
    expect(duplicates).toEqual([expect.objectContaining({ task: "SPA-5", match: "title" })]);
  });

  it("кандидата отбросил фильтр по символу — изменившийся якорь обновляется, повторно кандидата нет", async () => {
    const commentAbove = (code: string) => code.replace("}\n\nexport function retry", "}\n// повтор\nexport function retry");
    const { home, root, after, anchorOfSpa1 } = await symbolFixture((before) => `source: src/upload.ts:5\nanchor: ${anchorOf(before, "src/upload.ts:5")}\n`, commentAbove);

    const report = await check(root, home, "changed");

    expect(report.candidates).toEqual([]);
    expect(await anchorOfSpa1()).toBe(anchorOf(after, "src/upload.ts:5"));
  });

  it("кандидата фильтр по символу оставил — якорь не пишется, кандидат остаётся до разбора", async () => {
    const editUpload = (code: string) => code.replace('return "v1"', 'return "v2"');
    const { home, root, anchorOfSpa1 } = await symbolFixture(() => "source: src/upload.ts:2\n", editUpload);

    const first = await check(root, home, "changed");
    const second = await check(root, home, "changed");

    expect(first.candidates.map((candidate) => candidate.task.id)).toEqual(["SPA-1"]);
    expect(await anchorOfSpa1()).toBeUndefined();
    expect(second.candidates.map((candidate) => candidate.task.id)).toEqual(["SPA-1"]);
  });

  it("полный режим чинит данные, сообщает о проблемах и отдаёт кандидатов; при неразобранном файле эпики не закрывает", async () => {
    const { home, root } = await setup();

    const report = await check(root, home, "full");

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
        task: { id: "SPA-5", title: "Загрузка: таймаут не учитывает размер файла" },
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

    const report = await check(root, home, "full");

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

    await check(root, home, "full");

    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toMatchObject([{ kind: "status", task: "SPA-7", to: "done", resolution: "epic-done", via: "check" }]);
  });

  it("эпик, закрытый проверкой, снова открывается прежним статусом, когда его задачу открыли правкой файла", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-7.md": task("SPA-7", "type: epic\nstatus: in-progress\n"),
      "spa/SPA-8.md": task("SPA-8", "epic: SPA-7\nstatus: done\nclosed: 2026-09-12T10:00:00+03:00\n"),
    });
    await check(root, home, "full");
    await writeFiles(root, { "spa/SPA-8.md": task("SPA-8", "epic: SPA-7\n") });

    const report = await check(root, home, "full");

    expect(report.fixed.map(RU.checkFix)).toEqual(["SPA-7: эпик снова открыт — в нём открытые задачи: SPA-8"]);
    const epic = (await loadBacklog(root)).tasks.find((loaded) => loaded.id === "SPA-7");
    expect([epic?.status, epic?.resolution, epic?.reason, epic?.closed]).toEqual(["in-progress", undefined, undefined, undefined]);
    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events.at(-1)).toMatchObject({ kind: "status", task: "SPA-7", from: "done", to: "in-progress", via: "check" });
  });

  it("эпик, закрытый вручную, остаётся закрытым с открытой задачей", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-7.md": task("SPA-7", "type: epic\nstatus: cancelled\nclosed: 2026-09-12T10:00:00+03:00\nresolution: obsolete\nreason: передумали\n"),
      "spa/SPA-8.md": task("SPA-8", "epic: SPA-7\n"),
    });

    const report = await check(root, home, "full");

    expect(report.fixed).toEqual([]);
    expect((await loadBacklog(root)).tasks.find((loaded) => loaded.id === "SPA-7")?.status).toBe("cancelled");
  });

  it("узкий режим отдаёт только кандидатов по коду и не чинит ссылки и эпики", async () => {
    const { home, root } = await setup();

    const report = await check(root, home, "changed");

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
      "spa/SPA-1.md": sameProblemTask("SPA-1", "source: src/a.ts:1\n"),
      "spa/SPA-2.md": sameProblemTask("SPA-2", "source: src/a.ts:1\n"),
    });

    const first = await check(root, home, "full");
    await check(root, home, "full");

    expect(first.candidates).toMatchObject([{ kind: "duplicate", task: { id: "SPA-2" }, other: { id: "SPA-1" } }]);
    const candidates = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "candidate");
    expect(candidates).toMatchObject([{ task: "SPA-2", evidence: "duplicate", mode: "full", via: "check" }]);
  });

  it("пока репозиторий недоступен, эпизоды кандидатов по коду не закрываются и потом не открываются заново", async () => {
    const { home, root, repo } = await setup();

    await check(root, home, "full");
    await rename(repo, `${repo}-away`);
    await check(root, home, "full");
    await rename(`${repo}-away`, repo);
    await check(root, home, "full");

    const events = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.task === "SPA-1" && event.kind !== "candidate-filtered");
    expect(events.map((event) => event.kind)).toEqual(["candidate"]);
  });

  it("три задачи с одним source — по одному кандидату duplicate на задачу, без повторов", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": sameProblemTask("SPA-1", "source: src/a.ts:1\n"),
      "spa/SPA-2.md": sameProblemTask("SPA-2", "source: src/a.ts:1\n"),
      "spa/SPA-3.md": sameProblemTask("SPA-3", "source: src/a.ts:1\n"),
    });

    await check(root, home, "full");

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

    const report = await check(root, home, "full", ["pl", "br"]);

    expect(report.problems).toEqual(
      expect.arrayContaining([
        { kind: "project-repo-not-git", projectId: "pl", repo: plain },
        { kind: "project-history-unreadable", projectId: "br", repo: broken },
      ]),
    );
  });

  it("каталог другого владельца (dubious ownership) — своя проблема с лекарством, а не «не git-репозиторий»", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    const repo = await makeGitRepo(home, "projects/spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    await writeFiles(root, { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": task("SPA-1", "source: src/a.ts:1\n") });
    vi.stubEnv("GIT_TEST_ASSUME_DIFFERENT_OWNER", "1");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    const report = await check(root, home, "full");

    expect(report.problems).toEqual([{ kind: "project-repo-unsafe", projectId: "spa", repo }]);
    expect(report.problems.map((problem) => RU.checkProblem(problem))).toEqual([expect.stringContaining(`git config --global --add safe.directory "${repo}"`)]);
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

    const report = await check(root, home, "full", ["ti"]);

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

    const report = await check(root, home, "full");

    expect(report.fixed.map(RU.checkFix)).toEqual(["SPA-1: убраны ссылки на несуществующие задачи: SPA-99"]);
    expect(report.problems.map(RU.checkProblem)).toContainEqual(expect.stringContaining(`${join("ti", "project.md")} не разобран`));
    const spa1 = (await loadBacklog(root)).tasks.find((loaded) => loaded.id === "SPA-1");
    expect(spa1).toMatchObject({ blockedBy: [], related: ["TI-3", "XYZ-1"] });
  });

  it("сообщает о проектах с одним префиксом: их ID задач пересекаются", async () => {
    const home = await makeTempDir();
    const root = join(home, "backlog");
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa-2/project.md": projectFile("SPA"), "ti/project.md": projectFile("TI") });

    const report = await check(root, home, "full");

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

    const report = await check(root, home, "full");

    expect(report.fixed.map(RU.checkFix)).toEqual(["SPA-7: эпик закрыт — все задачи эпика закрыты: SPA-8"]);
    expect(report.problems.map(RU.checkProblem)).toEqual([expect.stringMatching(/^Проект spa: в repos нет путей/)]);

    await writeFiles(root, { "spa/SPA-9.md": "сломано" });
    const blocked = await check(root, home, "full");

    expect(blocked.problems.map(RU.checkProblem)).toContainEqual(expect.stringContaining(`${join("spa", "SPA-9.md")} не разобран`));
  });
});
