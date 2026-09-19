import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readJournal } from "../store/journal";
import { loadBacklog } from "../store/load";
import { gitCommitAll, makeGitRepo, makeTempDir, projectFile, writeFiles } from "../store/testing/temp-dirs";
import { anchorOf } from "./anchor";
import { checkBacklog } from "./check-backlog";

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

    const report = await checkBacklog(root, { projectIds: ["spa"], mode: "changed", now: NOW, home });

    expect(report.candidates).toEqual([]);
    expect(report.fixed).toEqual(["SPA-1: source сдвинулся :3 → :5"]);
    const tasks = (await loadBacklog(root)).tasks;
    const shifted = ["new1", "new2", code].join("\n");
    expect(tasks.find((item) => item.id === "SPA-1")).toMatchObject({ source: "src/a.ts:5", anchor: anchorOf(shifted, "src/a.ts:5") });
    expect(tasks.find((item) => item.id === "SPA-2")?.anchor).toBe(anchorOf(code, "src/b.ts:3"));
  });

  it("полный режим чинит данные, сообщает о проблемах и отдаёт кандидатов; при неразобранном файле эпики не закрывает", async () => {
    const { home, root } = await setup();

    const report = await checkBacklog(root, { projectIds: ["spa"], mode: "full", now: NOW, home });

    expect(report.fixed).toEqual(["SPA-9: убраны ссылки на несуществующие задачи: SPA-99"]);
    expect(report.problems).toEqual([
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
        diff: expect.stringMatching(/-v1\n\+v2/),
      },
      { kind: "source-missing", task: { id: "SPA-2", title: "Задача SPA-2" }, path: "src/legacy.ts" },
      {
        kind: "duplicate",
        task: { id: "SPA-5", title: "Загрузка: таймаут не учитывает большие файлы" },
        other: { id: "SPA-4", title: "Таймаут загрузки не учитывает размер файла" },
        match: "title",
      },
      { kind: "no-source", task: { id: "SPA-4", title: "Таймаут загрузки не учитывает размер файла" } },
      { kind: "no-source", task: { id: "SPA-5", title: "Загрузка: таймаут не учитывает большие файлы" } },
      { kind: "no-source", task: { id: "SPA-9", title: "Задача SPA-9" } },
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

    const report = await checkBacklog(root, { projectIds: ["spa"], mode: "full", now: NOW, home });

    expect(report.fixed).toEqual(["SPA-7: эпик закрыт — все задачи эпика закрыты: SPA-8"]);
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

    await checkBacklog(root, { projectIds: ["spa"], mode: "full", now: NOW, home });

    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toMatchObject([{ kind: "status", task: "SPA-7", to: "done", resolution: "epic-done", via: "check" }]);
  });

  it("узкий режим отдаёт только кандидатов по коду и ничего не пишет", async () => {
    const { home, root } = await setup();

    const report = await checkBacklog(root, { projectIds: ["spa"], mode: "changed", now: NOW, home });

    expect(report.fixed).toEqual([]);
    expect(report.problems).toEqual([]);
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

    const first = await checkBacklog(root, { projectIds: ["spa"], mode: "full", now: NOW, home });
    await checkBacklog(root, { projectIds: ["spa"], mode: "full", now: NOW, home });

    expect(first.candidates).toMatchObject([{ kind: "duplicate", task: { id: "SPA-2" }, other: { id: "SPA-1" } }]);
    const candidates = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "candidate");
    expect(candidates).toMatchObject([{ task: "SPA-2", evidence: "duplicate", mode: "full", via: "check" }]);
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

    await checkBacklog(root, { projectIds: ["spa"], mode: "full", now: NOW, home });

    const candidates = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "candidate");
    expect(candidates).toMatchObject([
      { task: "SPA-2", evidence: "duplicate" },
      { task: "SPA-3", evidence: "duplicate" },
    ]);
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

    const report = await checkBacklog(root, { projectIds: ["ti"], mode: "full", now: NOW, home });

    expect(report.problems).toEqual([expect.stringMatching(/^Проект ti: ни один путь из repos не существует/)]);
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

    const report = await checkBacklog(root, { projectIds: ["spa"], mode: "full", now: NOW, home });

    expect(report.fixed).toEqual(["SPA-1: убраны ссылки на несуществующие задачи: SPA-99"]);
    expect(report.problems).toContainEqual(expect.stringMatching(/ti\/project\.md не разобран/));
    const spa1 = (await loadBacklog(root)).tasks.find((loaded) => loaded.id === "SPA-1");
    expect(spa1).toMatchObject({ blockedBy: [], related: ["TI-3", "XYZ-1"] });
  });

  it("эпик ждёт неразобранных файлов — о них сообщается в любом проекте", async () => {
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

    const report = await checkBacklog(root, { projectIds: ["spa"], mode: "full", now: NOW, home });

    expect(report.fixed).toEqual([]);
    expect(report.problems).toEqual([
      expect.stringMatching(/docs\/DOC-1\.md не разобран: файл не начинается с frontmatter/),
      expect.stringMatching(/notes\/project\.md не разобран: нет project\.md/),
      "Эпики SPA-7 завершены, но не закроются, пока не исправлены неразобранные файлы",
      expect.stringMatching(/^Проект spa: в repos нет путей/),
    ]);
  });
});
