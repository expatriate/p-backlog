import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BatchResponse, CodeReport, CostReport, EffectReport, ErrorResponse, MemorySamplesResponse, QualityReport, SignalsReport, StatsReport } from "../core/api/contract";
import { projectGraphHealth } from "../core/check/graph-health";
import { runGit } from "../core/git/run";
import type { JournalEvent } from "../core/journal/events";
import { costReport } from "../core/stats/cost/cost-report";
import { statsReport } from "../core/stats/report";
import { reportContext } from "../core/stats/scope";
import { appendJournal, readJournals } from "../core/store/journal";
import { loadBacklog, unparsedTasks, type LoadedBacklog } from "../core/store/load";
import { readRuns } from "../core/store/testing/runs";
import { gitCommitAll, makeGitRepo, makeTempDir, projectFile, taskFile, writeFiles } from "../core/store/testing/temp-dirs";
import { failOnWriteError } from "../core/store/testing/update-task";
import type { UsageCache } from "../core/usage/usage-cache";
import { createJournalSources } from "./journal-sources";
import { createMemorySampler } from "./memory-sampler";
import { createStatsApi } from "./stats-api";
import { makeTestApp, SAMPLE_FILES, TEST_NOW } from "./testing/test-app";
import { createUsageScanner } from "./usage-scanner";

describe("кэш отчётов статистики и смена снимка беклога", () => {
  it("снимок, сменившийся между его чтением и записью отчёта в кэш, не отдаётся следующему запросу", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1") });
    const before = await loadBacklog(root);
    await writeFiles(root, { "spa/SPA-2.md": taskFile("SPA-2") });
    const after = await loadBacklog(root);
    let current: LoadedBacklog = before;
    const stats = createStatsApi({
      root,
      home: root,
      now: () => TEST_NOW,
      readLanguage: async () => "ru",
      services: {
        usage: createUsageScanner({ root, claudeProjectsDir: await makeTempDir(), warn: async () => undefined }),
        memory: createMemorySampler(),
        warn: async () => undefined,
      },
      graphHealth: (snapshot, project) => projectGraphHealth(project, snapshot.tasks, root),
      journalSources: createJournalSources(root),
      backlog: async () => {
        const read = current;
        if (read === before) {
          current = after;
          stats.forgetAll();
        }
        return read;
      },
    });

    await stats.routes.request("/stats");
    const report = (await (await stats.routes.request("/stats")).json()) as StatsReport;

    const fromScratch = statsReport(reportContext({ tasks: after.tasks, journals: await readJournals(root, ["spa"]), now: TEST_NOW, unparsedTasks: [] }));
    expect(report).toEqual(JSON.parse(JSON.stringify(fromScratch)));
  });
});

describe("GET /api/stats", () => {
  it("отдаёт отчёт по всем проектам и по одному", async () => {
    const backlog = await makeTestApp({
      ...SAMPLE_FILES,
      "spa/journal.jsonl": `${JSON.stringify({ at: "2026-09-18T10:00:00+03:00", task: "SPA-1", via: "cli", kind: "priority", from: "medium", to: "high" })}\nсломано\n`,
    });

    const all = (await (await backlog.request("/api/stats")).json()) as StatsReport;
    const spa = (await (await backlog.request("/api/stats?project=spa")).json()) as StatsReport;

    expect(all.totals.open).toBe(3);
    expect(spa.totals.open).toBe(2);
    expect(spa.invalidJournalLines).toBe(1);
    expect(Date.parse(spa.journalSince ?? "")).toBe(Date.parse("2026-09-18T10:00:00+03:00"));
    expect(spa.weeks).toHaveLength(12);
  });

  it("закрытие, отменённое кнопкой «Отменить», не считается ни закрытием, ни переоткрытием; ручное переоткрытие считается", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const batch = async (tasks: { id: string; version: string }[], action: unknown) => ((await (await backlog.json("/api/tasks/batch", "POST", { tasks, action })).json()) as BatchResponse).results;
    const versions = async (ids: string[]) => Promise.all(ids.map(async (id) => ({ id, version: await backlog.taskVersion(id) })));
    const stats = async () => (await (await backlog.request("/api/stats")).json()) as StatsReport;

    const closed = (await batch(await versions(["SPA-1", "SPA-2", "TI-1"]), { kind: "close", reason: "по ошибке" })).filter((result) => result.outcome === "done");
    expect(closed).toHaveLength(3);
    await batch(
      closed.map(({ id, version }) => ({ id, version })),
      { kind: "restore", changes: Object.fromEntries(closed.map((result) => [result.id, result.previous])) },
    );

    const afterUndo = await stats();
    expect([afterUndo.totals.closedToday, afterUndo.closing.byReason.obsolete, afterUndo.closing.reopened, afterUndo.weeks.at(-1)?.closed]).toEqual([0, 0, 0, 0]);

    await batch(await versions(["SPA-1"]), { kind: "close", reason: "неактуально" });
    await backlog.json("/api/tasks/SPA-1", "PATCH", { version: await backlog.taskVersion("SPA-1"), changes: { status: "backlog" } });

    const afterManualReopen = await stats();
    expect([afterManualReopen.totals.closedToday, afterManualReopen.closing.byReason.obsolete, afterManualReopen.closing.reopened]).toEqual([1, 1, 1]);
  });

  it("неразобранный файл задачи попадает в шапку отчёта своего проекта", async () => {
    const backlog = await makeTestApp({ ...SAMPLE_FILES, "spa/SPA-9.md": "---\nid: [\n---\n" });

    const spa = (await (await backlog.request("/api/stats?project=spa")).json()) as StatsReport;
    const all = (await (await backlog.request("/api/stats")).json()) as StatsReport;

    expect(spa.unparsedTasks).toBe(1);
    expect(all.unparsedTasks).toBe(1);
  });

  it("пустой project — как без параметра, все проекты", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.request("/api/stats?project=");

    expect(response.status).toBe(200);
    expect(((await response.json()) as StatsReport).totals.open).toBe(3);
  });

  it("неизвестный проект — 404", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const response = await backlog.request("/api/stats?project=nope");

    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorResponse).errors).toEqual(["Проект nope не найден"]);
  });
});

describe("кэш отчётов", () => {
  it("без изменений файлов отчёт отдаётся из кэша, изменение файлов и запись через API его сбрасывают", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const openCount = async () => ((await (await backlog.request("/api/stats?project=spa")).json()) as StatsReport).totals.open;
    const before = await openCount();

    await writeFiles(backlog.root, { "spa/SPA-7.md": taskFile("SPA-7") });
    expect(await openCount()).toBe(before);

    await backlog.emitChange();
    expect(await openCount()).toBe(before + 1);

    await writeFiles(backlog.root, { "spa/SPA-8.md": taskFile("SPA-8") });
    const patched = await backlog.json("/api/tasks/SPA-1", "PATCH", { version: await backlog.taskVersion("SPA-1"), changes: { priority: "low" } });
    expect(patched.status).toBe(200);
    expect(await openCount()).toBe(before + 2);
  });

  it("изменение в проекте A не сбрасывает кэш отчёта проекта B, но сбрасывает «все проекты»", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    const openOf = async (query: string) => ((await (await backlog.request(`/api/stats${query}`)).json()) as StatsReport).totals.open;
    const bBefore = await openOf("?project=torg-io");
    const allBefore = await openOf("");

    await writeFiles(backlog.root, { "spa/SPA-7.md": taskFile("SPA-7") });
    await backlog.emitChange([join(backlog.root, "spa", "SPA-7.md")]);

    await writeFiles(backlog.root, { "torg-io/TI-2.md": taskFile("TI-2") });

    expect(await openOf("?project=torg-io")).toBe(bBefore);
    expect(await openOf("")).toBe(allBefore + 2);
  });

  it("новый коммит в репозитории пересчитывает отчёт «Код» без изменения файлов беклога", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const backlog = await makeTestApp({ "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": taskFile("SPA-1", "source: src/a.ts:1\n") });
    const commits = async () => ((await (await backlog.request("/api/stats/code?project=spa")).json()) as CodeReport).churn[0]?.commits;

    expect(await commits()).toBe(1);
    await writeFiles(repo, { "src/a.ts": "a\nb\n" });
    gitCommitAll(repo, "second", "2026-09-12T10:00:00+03:00");

    expect(await commits()).toBe(2);
  });
});

describe("статистика после изменений равна собранной с нуля", () => {
  const event = (at: string, fields: Record<string, unknown>) => ({ at, via: "cli", ...fields }) as JournalEvent;

  async function statsFromScratch(root: string, projectId?: string): Promise<StatsReport> {
    const { projects, tasks, errors } = await loadBacklog(root);
    const ids = projects.filter((project) => project.active).map((project) => project.id);
    const inScope = (task: { projectId: string }) => ids.includes(task.projectId);
    const journals = await readJournals(root, ids);
    const report = statsReport(reportContext({ tasks: tasks.filter(inScope), journals, now: TEST_NOW, projectId, unparsedTasks: unparsedTasks(errors).filter(inScope) }));
    return JSON.parse(JSON.stringify(report)) as StatsReport;
  }

  it("после дописывания событий в журналы отчёты по всем проектам и по одному равны собранным с нуля", async () => {
    const backlog = await makeTestApp({
      ...SAMPLE_FILES,
      "spa/journal.jsonl": `${JSON.stringify(event("2026-09-10T10:00:00+03:00", { task: "SPA-1", kind: "created", type: "task", priority: "medium", tags: [] }))}\n`,
    });
    const stats = async (query = "") => (await (await backlog.request(`/api/stats${query}`)).json()) as StatsReport;
    const allBefore = await stats();
    const spaBefore = await stats("?project=spa");

    await appendJournal(
      join(backlog.root, "spa"),
      [
        event("2026-09-11T10:00:00+03:00", { task: "SPA-9", kind: "created", type: "task", priority: "high", tags: [] }),
        event("2026-09-12T10:00:00+03:00", { task: "SPA-9", kind: "status", from: "backlog", to: "done", resolution: "fixed" }),
        event("2026-09-13T10:00:00+03:00", { task: "SPA-1", kind: "priority", from: "medium", to: "high" }),
      ],
      failOnWriteError,
    );
    await appendFile(join(backlog.root, "spa", "journal.jsonl"), "сломано\n");
    await appendJournal(join(backlog.root, "torg-io"), [event("2026-09-14T10:00:00+03:00", { task: "TI-1", kind: "status", from: "backlog", to: "in-progress" })], failOnWriteError);
    await backlog.emitChange([join(backlog.root, "spa", "journal.jsonl"), join(backlog.root, "torg-io", "journal.jsonl")]);

    const all = await stats();
    const spa = await stats("?project=spa");

    expect([all, spa]).not.toEqual([allBefore, spaBefore]);
    expect(spa.invalidJournalLines).toBe(1);
    expect(all).toEqual(await statsFromScratch(backlog.root));
    expect(spa).toEqual(await statsFromScratch(backlog.root, "spa"));
  });

  it("правка категории в файле задачи задним числом меняет отчёт «Качество»", async () => {
    const backlog = await makeTestApp({ ...SAMPLE_FILES, "spa/SPA-1.md": taskFile("SPA-1", "category: bug\n") });
    const categories = async () => ((await (await backlog.request("/api/stats/quality?project=spa")).json()) as QualityReport).categories.map((row) => row.category);
    expect(await categories()).toContain("bug");

    await writeFiles(backlog.root, { "spa/SPA-1.md": taskFile("SPA-1", "category: bloaters\n") });
    await backlog.emitChange([join(backlog.root, "spa", "SPA-1.md")]);

    expect(await categories()).toContain("bloaters");
    expect(await categories()).not.toContain("bug");
  });
});

describe("GET /api/stats/code", () => {
  it("отдаёт отчёт по коду проекта и недоступные репозитории", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\nb\n" });
    gitCommitAll(repo, "init", "2026-09-10T10:00:00+03:00");
    const backlog = await makeTestApp({
      "spa/project.md": projectFile("SPA", [repo, "/nope/repo"]),
      "spa/SPA-1.md": taskFile("SPA-1", "priority: high\nsource: src/a.ts:1\n"),
    });

    const report = (await (await backlog.request("/api/stats/code?project=spa")).json()) as CodeReport;

    expect(report.churn).toEqual([{ label: "src", commits: 1, tasks: 1, weight: 4, score: 4 }]);
    expect(report.density.projects).toEqual([{ projectId: "spa", name: "spa", lines: 2, open: 1, perKloc: 500 }]);
    expect(report.unavailableRepos).toEqual(["/nope/repo"]);
  });

  it("неизвестный проект — 404, пустой — все проекты", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const unknown = await backlog.request("/api/stats/code?project=nope");
    const empty = await backlog.request("/api/stats/code?project=");

    expect(unknown.status).toBe(404);
    expect(((await empty.json()) as CodeReport).taskCount).toBe(3);
  });
});

const createdByAgent = (task: string) => `${JSON.stringify({ at: "2026-09-17T10:00:00+03:00", task, via: "cli", kind: "created", type: "task", priority: "medium", tags: [], found: "incidental" })}\n`;

async function spaWithFixedNeighbour({ neighbourActive }: { neighbourActive: boolean }): Promise<Record<string, string>> {
  const home = await makeTempDir();
  const spaRepo = await makeGitRepo(home, "spa");
  await writeFiles(spaRepo, { "src/a.ts": "a\n" });
  gitCommitAll(spaRepo, "init", "2026-09-17T09:00:00+03:00");
  const tiRepo = await makeGitRepo(home, "ti");
  const tiFixes: Record<string, string> = {};
  for (const index of [1, 2, 3, 4, 5]) {
    await writeFiles(tiRepo, { "src/b.ts": `${"x\n".repeat(index * 3)}` });
    gitCommitAll(tiRepo, `fix ${index}`, "2026-09-17T11:00:00+03:00");
    const sha = (await runGit(tiRepo, ["rev-parse", "--short", "HEAD"]))?.trim() ?? "";
    tiFixes[`ti/TI-${index}.md`] = taskFile(`TI-${index}`, `status: done\nclosed: 2026-09-17T12:00:00+03:00\nresolution: fixed\nreason: Исправлено в ${sha}\n`);
  }
  return {
    "spa/project.md": projectFile("SPA", [spaRepo]),
    "spa/SPA-1.md": taskFile("SPA-1", "source: src/a.ts:1\n"),
    "spa/journal.jsonl": createdByAgent("SPA-1"),
    "ti/project.md": projectFile("TI", [tiRepo], { active: neighbourActive }),
    ...tiFixes,
  };
}

describe("GET /api/stats/effect", () => {
  it("отчёт эффекта по проекту с репозиторием, неизвестный проект — 404", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\nb\n" });
    gitCommitAll(repo, "init", "2026-09-17T20:00:00+03:00");
    const backlog = await makeTestApp({
      "spa/project.md": projectFile("SPA", [repo]),
      "spa/SPA-1.md": taskFile("SPA-1", "source: src/a.ts:1\n"),
      "spa/journal.jsonl": createdByAgent("SPA-1"),
    });

    const report = (await (await backlog.request("/api/stats/effect?project=spa")).json()) as EffectReport;

    expect(report.totals).toMatchObject({ realLines: 2, openTasks: 1, estimatedLines: null });
    expect(report.projects).toHaveLength(1);
    expect((await backlog.request("/api/stats/effect?project=nope")).status).toBe(404);
  });

  it("оценка ожидающих в проекте опирается на исправления соседних проектов", async () => {
    const backlog = await makeTestApp(await spaWithFixedNeighbour({ neighbourActive: true }));

    const report = (await (await backlog.request("/api/stats/effect?project=spa")).json()) as EffectReport;

    expect(report.totals).toMatchObject({ openTasks: 1, estimatedLines: 3 });
  });

  it("оценка проекта одинакова на его странице и во «Всех проектах»: неактивные проекты в выборку не входят", async () => {
    const backlog = await makeTestApp(await spaWithFixedNeighbour({ neighbourActive: false }));

    const own = (await (await backlog.request("/api/stats/effect?project=spa")).json()) as EffectReport;
    const all = (await (await backlog.request("/api/stats/effect")).json()) as EffectReport;

    expect(all.projects.find((project) => project.projectId === "spa")?.estimatedLines).toBe(own.totals.estimatedLines);
  });
});

describe("GET /api/stats/quality", () => {
  it("отдаёт отчёт качества по проекту, неизвестный проект — 404", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);

    const spa = (await (await backlog.request("/api/stats/quality?project=spa")).json()) as QualityReport;
    const unknown = await backlog.request("/api/stats/quality?project=nope");

    expect(spa.taskCount).toBe(2);
    expect(spa.found.map((row) => row.found)).toEqual(["review", "incidental", "manual", "unknown", "unset"]);
    expect(unknown.status).toBe(404);
  });
});

describe("GET /api/stats/signals", () => {
  it("тревоги области, неизвестный проект — 404", async () => {
    const backlog = await makeTestApp({
      ...SAMPLE_FILES,
      "spa/SPA-9.md": "---\nid: SPA-9\ntitle: Задача SPA-9\ncreated: 2026-09-01T10:00:00+03:00\npriority: critical\n---\n",
    });

    const report = (await (await backlog.request("/api/stats/signals?project=spa")).json()) as SignalsReport;

    expect(report.signals).toContainEqual({ kind: "urgent-stale", params: { days: 7, count: 1 } });
    expect((await backlog.request("/api/stats/signals?project=nope")).status).toBe(404);
  });
});

describe("GET /api/stats/cost и /api/stats/memory", () => {
  it("после scanOnce считает токены, ход хука, вызовы CLI и деньги; неизвестный проект — 404", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    const transcriptsDir = await makeTempDir();
    const at = "2026-09-18T09:00:00.000Z";
    await writeFiles(transcriptsDir, {
      "proj1/session.jsonl":
        [
          { type: "user", isMeta: true, timestamp: at, cwd: repo, message: { content: "Stop hook feedback:\nБеклог spa: тест" } },
          {
            type: "assistant",
            timestamp: at,
            cwd: repo,
            message: { model: "claude-opus-5", usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
          },
        ]
          .map((line) => JSON.stringify(line))
          .join("\n") + "\n",
    });

    const backlog = await makeTestApp({ "spa/project.md": projectFile("SPA", [repo]) }, { transcriptsDir });
    await appendFile(
      join(backlog.root, ".runs.jsonl"),
      [
        { at: "2026-09-18T09:30:00+03:00", command: "hook stop", cwd: repo, ms: 120, rssMb: 90, exitCode: 0 },
        { at: "2026-09-18T09:31:00+03:00", command: "list", cwd: repo, ms: 40, rssMb: 80, exitCode: 0 },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n") + "\n",
      "utf8",
    );

    await backlog.usage.scanOnce();

    const response = await backlog.request("/api/stats/cost?project=spa");
    expect(response.status).toBe(200);
    const report = (await response.json()) as CostReport;
    expect(report.totals).toMatchObject({ hookTurns: 1, hookRuns: 1, cliRuns: 1 });
    expect(report.totals.tokens).toBeGreaterThan(0);
    expect(report.totals.cost).not.toBeNull();
    expect(report.totals.cost ?? 0).toBeGreaterThan(0);

    expect((await backlog.request("/api/stats/cost?project=nope")).status).toBe(404);
  });

  it("новый запуск CLI попадает в отчёт", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    await backlog.usage.scanOnce();
    const runsPath = join(backlog.root, ".runs.jsonl");
    await writeFile(runsPath, `${JSON.stringify({ at: "2026-09-18T09:00:00+03:00", command: "list", cwd: "/tmp/repo", ms: 10, rssMb: 50, exitCode: 0 })}\n`, "utf8");

    const before = (await (await backlog.request("/api/stats/cost")).json()) as CostReport;
    expect(before.totals.cliRuns).toBe(1);

    await appendFile(runsPath, `${JSON.stringify({ at: "2026-09-18T09:05:00+03:00", command: "show", cwd: "/tmp/repo", ms: 20, rssMb: 60, exitCode: 0 })}\n`, "utf8");

    const after = (await (await backlog.request("/api/stats/cost")).json()) as CostReport;
    expect(after.totals.cliRuns).toBe(2);
    expect(after.commands.map((row) => row.command)).toContain("show");
  });

  it("запуск CLI, дописанный без перевода строки, попадает в отчёт, как при чтении журнала целиком", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    await backlog.usage.scanOnce();
    const runsPath = join(backlog.root, ".runs.jsonl");
    const secondRun = JSON.stringify({ at: "2026-09-18T09:05:00+03:00", command: "show", cwd: "/tmp/repo", ms: 20, rssMb: 60, exitCode: 0 });
    const cutAt = secondRun.indexOf("show");
    await writeFile(runsPath, `${JSON.stringify({ at: "2026-09-18T09:00:00+03:00", command: "list", cwd: "/tmp/repo", ms: 10, rssMb: 50, exitCode: 0 })}\n${secondRun.slice(0, cutAt)}`, "utf8");

    const before = (await (await backlog.request("/api/stats/cost")).json()) as CostReport;
    expect(before.totals.cliRuns).toBe(1);

    await appendFile(runsPath, secondRun.slice(cutAt), "utf8");

    const after = (await (await backlog.request("/api/stats/cost")).json()) as CostReport;
    expect(after.totals.cliRuns).toBe((await readRuns(backlog.root)).length);
    expect(after.totals.cliRuns).toBe(2);
  });

  it("правка repos в project.md сразу меняет привязку «Стоимости» — без новых запусков и без нового дня", async () => {
    const home = await makeTempDir();
    const primaryRepo = await makeGitRepo(home, "spa");
    const sharedRepo = await makeGitRepo(home, "shared");
    const backlog = await makeTestApp({ "spa/project.md": projectFile("SPA", [primaryRepo]) });
    await backlog.usage.scanOnce();
    await writeFile(join(backlog.root, ".runs.jsonl"), `${JSON.stringify({ at: "2026-09-18T09:00:00+03:00", command: "list", cwd: sharedRepo, ms: 10, rssMb: 50, exitCode: 0 })}\n`, "utf8");

    const before = (await (await backlog.request("/api/stats/cost?project=spa")).json()) as CostReport;
    expect(before.totals.cliRuns).toBe(0);

    await writeFiles(backlog.root, { "spa/project.md": projectFile("SPA", [primaryRepo, sharedRepo]) });
    await backlog.emitChange([join(backlog.root, "spa", "project.md")]);

    const after = (await (await backlog.request("/api/stats/cost?project=spa")).json()) as CostReport;
    expect(after.totals.cliRuns).toBe(1);
  });

  it("обрезка журнала запусков не ломает отчёт: результат равен пересчёту с нуля", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    await backlog.usage.scanOnce();
    const runsPath = join(backlog.root, ".runs.jsonl");
    const runs = [
      { at: "2026-09-18T09:00:00+03:00", command: "list", cwd: "/tmp/repo", ms: 10, rssMb: 50, exitCode: 0 },
      { at: "2026-09-18T09:05:00+03:00", command: "show", cwd: "/tmp/repo", ms: 20, rssMb: 60, exitCode: 0 },
    ];
    await writeFile(runsPath, runs.map((run) => `${JSON.stringify(run)}\n`).join(""), "utf8");
    await backlog.request("/api/stats/cost");

    await writeFile(runsPath, `${JSON.stringify(runs[1])}\n`, "utf8");
    const report = (await (await backlog.request("/api/stats/cost")).json()) as CostReport;

    const { cache, scan } = backlog.usage.snapshot();
    const buckets = Object.values((cache as UsageCache).files).flatMap((entry) => entry.buckets);
    const fresh = costReport({ buckets, runs: await readRuns(backlog.root), projectOf: () => null, now: TEST_NOW, scan });
    expect(report).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it("расшифровка, обрезанная до нуля, уходит из отчёта, хотя новых байт не было", async () => {
    const transcriptsDir = await makeTempDir();
    const hookLine = JSON.stringify({ type: "user", isMeta: true, timestamp: "2026-09-18T08:59:00.000Z", cwd: "/x", message: { content: "Stop hook feedback:\nБеклог spa: тест" } });
    const assistantLine = JSON.stringify({ type: "assistant", timestamp: "2026-09-18T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1000, output_tokens: 1000 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${hookLine}\n${assistantLine}\n` });
    const backlog = await makeTestApp({}, { transcriptsDir });
    await backlog.usage.scanOnce();
    const before = (await (await backlog.request("/api/stats/cost")).json()) as CostReport;
    expect(before.totals.tokens).toBeGreaterThan(0);

    await writeFile(join(transcriptsDir, "proj", "a.jsonl"), "");
    await backlog.usage.scanOnce();
    const report = (await (await backlog.request("/api/stats/cost")).json()) as CostReport;

    const { cache, scan } = backlog.usage.snapshot();
    const fresh = costReport({ buckets: Object.values(cache.files).flatMap((entry) => entry.buckets), runs: [], projectOf: () => null, now: TEST_NOW, scan });
    expect(fresh.totals.tokens).toBe(0);
    expect(report).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it("после перезапуска отчёт, запрошенный во время первого прохода, не застревает пустым", async () => {
    const transcriptsDir = await makeTempDir();
    const hookLine = JSON.stringify({ type: "user", isMeta: true, timestamp: "2026-09-18T08:59:00.000Z", cwd: "/x", message: { content: "Stop hook feedback:\nБеклог spa: тест" } });
    const assistantLine = JSON.stringify({ type: "assistant", timestamp: "2026-09-18T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1000, output_tokens: 1000 } } });
    await writeFiles(transcriptsDir, Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`proj/${index}.jsonl`, `${hookLine}\n${assistantLine}\n`])));
    const beforeRestart = await makeTestApp({}, { transcriptsDir });
    await beforeRestart.usage.scanOnce();
    const usageCache = await readFile(join(beforeRestart.root, ".usage-cache.json"), "utf8");

    const backlog = await makeTestApp({ ".usage-cache.json": usageCache }, { transcriptsDir });
    await backlog.request("/api/stats/cost");
    while (!backlog.usage.snapshot().scan.listed) await new Promise((resolve) => setImmediate(resolve));
    await backlog.request("/api/stats/cost");
    await backlog.usage.scanOnce();
    const report = (await (await backlog.request("/api/stats/cost")).json()) as CostReport;

    const { cache, scan } = backlog.usage.snapshot();
    const fresh = costReport({ buckets: Object.values(cache.files).flatMap((entry) => entry.buckets), runs: [], projectOf: () => null, now: TEST_NOW, scan });
    expect(fresh.totals.tokens).toBeGreaterThan(0);
    expect(report).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it("отдаёт точки памяти сервера", async () => {
    const backlog = await makeTestApp(SAMPLE_FILES);
    backlog.memory.sample();

    const response = await backlog.request("/api/stats/memory");

    expect(response.status).toBe(200);
    const { samples } = (await response.json()) as MemorySamplesResponse;
    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0]?.rssMb).toBeGreaterThan(0);
  });
});
