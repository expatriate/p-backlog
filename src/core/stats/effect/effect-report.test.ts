import { describe, expect, it } from "vitest";
import { createdEvent, type FoundHow, type ProjectJournal } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import type { Task } from "../../model/types";
import { codeFixRequests } from "../code/code-report";
import { fixKey } from "../../code/fix-key";
import type { CollectedCode, FixCommit } from "../../code/types";
import { effectReport } from "./effect-report";

const NOW = new Date(2026, 8, 18, 12);
const iso = (month: number, day: number) => formatLocalIso(new Date(2026, month, day, 12));
const fixed = (index: number, lines: number): { task: Task; commit: [string, FixCommit] } => ({
  task: makeTask({ id: `SPA-${index}`, created: iso(8, index), status: "done", closed: iso(8, 10), resolution: "fixed", reason: `Исправлено в aaaaaa${index}`, category: "bug" }),
  commit: [fixKey("spa", `aaaaaa${index}`), { date: iso(8, 10), byAgent: true, lines, testLines: lines / 2 }],
});
const createdOf = (tasks: readonly Task[], found: FoundHow | undefined) => tasks.map((task) => createdEvent(task, new Date(task.created), "cli", { found }));
const journalsOf = (tasks: readonly Task[], found: FoundHow | undefined): ProjectJournal[] =>
  [...new Set(tasks.map((task) => task.projectId))].map((projectId) => ({ projectId, invalidLines: 0, events: createdOf(tasks.filter((task) => task.projectId === projectId), found) }));
const incidental = (tasks: readonly Task[]) => ({ tasks, journals: journalsOf(tasks, "incidental") });
const code = (commits: [string, FixCommit][], units = [{ date: iso(8, 15), lines: 300 }, { date: iso(8, 2), lines: 100 }, { date: iso(5, 1), lines: 999 }]): CollectedCode => ({
  projects: [{ projectId: "spa", name: "Проект spa", repos: [{ commits: [], lines: [], units }] }],
  unavailableRepos: [],
  fixCommits: new Map(commits),
});

describe("эффект беклога", () => {
  const fixes = [10, 20, 30, 40, 50, 60].map((lines, index) => fixed(index + 1, lines));
  const others = [
    makeTask({ id: "SPA-7", created: iso(8, 15), category: "bug" }),
    makeTask({ id: "SPA-8", created: iso(8, 16), category: "bloaters" }),
    makeTask({ id: "SPA-9", created: iso(8, 2), status: "cancelled", closed: iso(8, 3), resolution: "obsolete" }),
    makeTask({ id: "SPA-10", created: iso(8, 2), status: "done", closed: iso(8, 3), resolution: "fixed", reason: "Исправлено без коммита" }),
  ];

  it("исправленные — точно, открытые — по медиане, закрытые без исправления не считаются", () => {
    const report = effectReport({ ...incidental([...fixes.map((fix) => fix.task), ...others]), now: NOW, projectId: "spa", code: code(fixes.map((fix) => fix.commit)) });

    expect(report.totals).toEqual({ realLines: 400, fixedTasks: 6, fixedLines: 210, openTasks: 2, deferredTasks: 8, estimatedLines: 70, deferredLines: 280, deferredTestLines: 140, noiseShare: 280 / 470 });
    expect(report.weeks).toHaveLength(12);
    expect(report.weeks.at(-1)).toMatchObject({ onTopicLines: 300, deferredLines: 70, deferredTestLines: 35, deferredTasks: 2 });
    expect(report.weeks.at(-2)).toMatchObject({ onTopicLines: 0, deferredLines: 210, deferredTasks: 6 });
    expect(report.weeks.at(-3)).toMatchObject({ onTopicLines: 100, deferredLines: 0, deferredTasks: 0 });
    expect(report.projects).toEqual([{ projectId: "spa", name: "Проект spa", realLines: 400, deferredTasks: 8, fixedLines: 210, estimatedLines: 70, noiseShare: 280 / 470 }]);
  });

  it("находки ревью, задачи по просьбе пользователя и задачи без отметки не считаются вынесенными, но их исправления дают оценку", () => {
    const review = fixes.map((fix) => fix.task);
    const manual = makeTask({ id: "SPA-7", created: iso(8, 15), category: "bug" });
    const unrecorded = makeTask({ id: "SPA-8", created: iso(8, 15), category: "bug" });
    const byAgent = makeTask({ id: "SPA-9", created: iso(8, 16), category: "bug" });
    const events = [...createdOf(review, "review"), ...createdOf([manual], "manual"), ...createdOf([unrecorded], undefined), ...createdOf([byAgent], "incidental")];

    const report = effectReport({ tasks: [...review, manual, unrecorded, byAgent], journals: [{ projectId: "spa", invalidLines: 0, events }], now: NOW, projectId: "spa", code: code(fixes.map((fix) => fix.commit)) });

    expect(report.totals).toMatchObject({ fixedTasks: 0, fixedLines: 0, openTasks: 1, estimatedLines: 35 });
    expect(report.projects[0]?.deferredTasks).toBe(1);
    expect(report.weeks.at(-2)).toMatchObject({ deferredLines: 0, deferredTasks: 0 });
  });

  it("без вынесенных задач доля шума пустая, а не нулевая", () => {
    const review = fixes.map((fix) => fix.task);

    const report = effectReport({ tasks: review, journals: journalsOf(review, "review"), now: NOW, projectId: "spa", code: code(fixes.map((fix) => fix.commit)) });

    expect(report.totals).toMatchObject({ realLines: 400, fixedTasks: 0, openTasks: 0, noiseShare: null });
    expect(report.projects[0]?.noiseShare).toBeNull();
  });

  it("по дням: правка и вынесенная задача попадают каждая в свой день", () => {
    const report = effectReport({ ...incidental([...fixes.map((fix) => fix.task), ...others]), now: NOW, projectId: "spa", code: code(fixes.map((fix) => fix.commit)) });
    const day = (month: number, date: number) => report.days.find((bucket) => bucket.start.startsWith(iso(month, date).slice(0, 10)));

    expect(report.days).toHaveLength(30);
    expect(day(8, 15)).toMatchObject({ onTopicLines: 300, deferredLines: 35, deferredTasks: 1 });
    expect(day(8, 16)).toMatchObject({ onTopicLines: 0, deferredLines: 35, deferredTasks: 1 });
    expect(day(8, 10)).toMatchObject({ onTopicLines: 0, deferredLines: 210, deferredTasks: 6 });
    expect(day(8, 2)).toMatchObject({ onTopicLines: 100, deferredLines: 0, deferredTasks: 0 });
  });

  it("строки исправления с ветки ложатся в неделю попадания в основную ветку, а не в неделю коммита", () => {
    const branchFix: [string, FixCommit] = [fixKey("spa", "aaaaaa1"), { date: iso(8, 10), landedAt: iso(8, 15), byAgent: true, lines: 40, testLines: 0 }];

    const report = effectReport({ ...incidental(fixes.slice(0, 1).map((fix) => fix.task)), now: NOW, projectId: "spa", code: code([branchFix]) });

    expect(report.weeks.at(-1)).toMatchObject({ onTopicLines: 260, deferredLines: 40, deferredTasks: 1 });
    expect(report.weeks.at(-2)).toMatchObject({ deferredLines: 0, deferredTasks: 0 });
  });

  it("меньше 5 исправлений — оценки ожидающих нет", () => {
    const few = fixes.slice(0, 4);

    const report = effectReport({ ...incidental([...few.map((fix) => fix.task), ...others]), now: NOW, projectId: "spa", code: code(few.map((fix) => fix.commit)) });

    expect(report.totals).toMatchObject({ fixedTasks: 4, fixedLines: 100, openTasks: 2, estimatedLines: null, deferredLines: 100 });
  });

  it("в проекте оценка ожидающих опирается на исправления всего беклога", () => {
    const tiFixes = [10, 20, 30, 40, 50].map((lines, index) =>
      makeTask({ id: `TI-${index + 1}`, projectId: "ti", created: iso(8, index + 1), status: "done", closed: iso(8, 10), resolution: "fixed", reason: `Исправлено в cccccc${index + 1}` }),
    );
    const commits: [string, FixCommit][] = [10, 20, 30, 40, 50].map((lines, index) => [fixKey("ti", `cccccc${index + 1}`), { date: iso(8, 10), byAgent: true, lines, testLines: 0 }]);
    const openInSpa = makeTask({ id: "SPA-7", created: iso(8, 15) });

    const report = effectReport({ ...incidental([...tiFixes, openInSpa]), now: NOW, projectId: "spa", code: code(commits) });

    expect(report.totals).toMatchObject({ fixedTasks: 0, openTasks: 1, estimatedLines: 30 });
  });

  it("исправления из невлитых веток не делают долю шума больше 100%", () => {
    const bigFixes = [100, 100, 100, 100, 200].map((lines, index) => fixed(index + 1, lines));
    const units = [{ date: iso(8, 15), lines: 50 }];

    const report = effectReport({ ...incidental(bigFixes.map((fix) => fix.task)), now: NOW, projectId: "spa", code: code(bigFixes.map((fix) => fix.commit), units) });

    expect(report.totals).toMatchObject({ realLines: 50, fixedLines: 600, openTasks: 0, noiseShare: 1 });
  });

  it("пока оценка ожидающих неизвестна, доля шума пустая, а не нулевая", () => {
    const few = fixes.slice(0, 4);

    const report = effectReport({ ...incidental([...few.map((fix) => fix.task), ...others]), now: NOW, projectId: "spa", code: code(few.map((fix) => fix.commit)) });

    expect(report.totals).toMatchObject({ openTasks: 2, estimatedLines: null, noiseShare: null });
  });

  it("без коммитов после внедрения сравнивать не с чем — доля шума пустая", () => {
    const report = effectReport({ ...incidental([...fixes.map((fix) => fix.task), ...others]), now: NOW, projectId: "spa", code: code(fixes.map((fix) => fix.commit), []) });

    expect(report.totals.realLines).toBe(0);
    expect(report.totals.noiseShare).toBeNull();
  });

  it("одна и та же задача-исправление на нескольких задачах — коммит учтён один раз, в медиане тоже один раз", () => {
    const sameFix = (id: string, day: number) => makeTask({ id, created: iso(8, day), status: "done", closed: iso(8, 10), resolution: "fixed", reason: "Исправлено в bbbbbb1", category: "bug" });
    const sharedOne = sameFix("SPA-101", 1);
    const sharedTwo = sameFix("SPA-102", 2);
    const singles = [11, 22, 33, 44].map((lines, index) => fixed(index + 3, lines));
    const openTask = makeTask({ id: "SPA-108", created: iso(8, 16), category: "bug" });
    const commits: [string, FixCommit][] = [[fixKey("spa", "bbbbbb1"), { date: iso(8, 10), byAgent: true, lines: 40, testLines: 10 }], ...singles.map((fix) => fix.commit)];

    const report = effectReport({
      ...incidental([sharedOne, sharedTwo, ...singles.map((fix) => fix.task), openTask]),
      now: NOW,
      projectId: "spa",
      code: code(commits, []),
    });

    expect(report.totals.fixedTasks).toBe(6);
    expect(report.totals.fixedLines).toBe(40 + 11 + 22 + 33 + 44);
    expect(report.totals.estimatedLines).toBe(33);
    const sampleTestShare = (10 + 5.5 + 11 + 16.5 + 22) / (40 + 11 + 22 + 33 + 44);
    expect(report.totals.deferredTestLines).toBeCloseTo(10 + 5.5 + 11 + 16.5 + 22 + 33 * sampleTestShare);
  });

  it("строки коммита делятся на все задачи, которые на него ссылаются, даже на созданную до периода", () => {
    const sameFix = (id: string, created: string) => makeTask({ id, created, status: "done", closed: iso(8, 10), resolution: "fixed", reason: "Исправлено в dddddd1" });
    const commits: [string, FixCommit][] = [[fixKey("spa", "dddddd1"), { date: iso(8, 10), byAgent: true, lines: 100, testLines: 40 }]];

    const report = effectReport({ ...incidental([sameFix("SPA-201", iso(2, 1)), sameFix("SPA-202", iso(8, 5))]), now: NOW, projectId: "spa", code: code(commits) });

    expect(report.totals).toMatchObject({ fixedTasks: 1, fixedLines: 50, deferredTestLines: 20 });
  });

  it("задача, закрытая до окна хранения, не делит с новой строки общего коммита — уплотнение журнала итог не меняет", () => {
    const sameFix = (id: string, created: string, closed: string) => makeTask({ id, created, status: "done", closed, resolution: "fixed", reason: "Исправлено в dddddd1" });
    const commits: [string, FixCommit][] = [[fixKey("spa", "dddddd1"), { date: iso(8, 10), byAgent: true, lines: 100, testLines: 40 }]];

    const report = effectReport({ ...incidental([sameFix("SPA-201", iso(0, 5), iso(1, 10)), sameFix("SPA-202", iso(8, 5), iso(8, 10))]), now: NOW, projectId: "spa", code: code(commits) });

    expect(report.totals).toMatchObject({ fixedTasks: 1, fixedLines: 100, deferredTestLines: 40 });
  });

  it("отчёт одинаков с пустым и заполненным кэшем коммитов: запрашиваются все исправления, которые учитывает оценка", () => {
    const closedEightyEightDaysAgo = makeTask({ id: "SPA-50", created: iso(5, 1), status: "done", closed: iso(5, 22), resolution: "fixed", reason: "Исправлено в eeeeee1", category: "bug" });
    const oldFixCommit: [string, FixCommit] = [fixKey("spa", "eeeeee1"), { date: iso(5, 22), byAgent: true, lines: 70, testLines: 0 }];
    const recent = fixes.slice(0, 4);
    const input = { ...incidental([closedEightyEightDaysAgo, ...recent.map((fix) => fix.task), ...others]), now: NOW, projectId: "spa" };
    const filledCache: [string, FixCommit][] = [oldFixCommit, ...recent.map((fix) => fix.commit)];
    const requestedKeys = new Set(codeFixRequests(input).flatMap(({ projectId, hashes }) => hashes.map((hash) => fixKey(projectId, hash))));
    const fetchedIntoEmptyCache = filledCache.filter(([key]) => requestedKeys.has(key));

    const fromEmptyCache = effectReport({ ...input, code: code(fetchedIntoEmptyCache) });
    const fromFilledCache = effectReport({ ...input, code: code(filledCache) });

    expect(fromFilledCache.totals.estimatedLines).not.toBeNull();
    expect(fromEmptyCache).toEqual(fromFilledCache);
  });

  it("окно итогов начинается с даты внедрения беклога проектом, недели показывают весь период", () => {
    const task = makeTask({ id: "SPA-30", created: iso(8, 15), category: "bug" });

    const report = effectReport({ ...incidental([task]), now: NOW, projectId: "spa", code: code([]) });

    expect(report.totals.realLines).toBe(300);
    expect(report.weeks.at(-3)).toMatchObject({ onTopicLines: 100 });
  });

  it("границы окон в отчёте совпадают с окнами расчёта", () => {
    const report = effectReport({ tasks: [], journals: [], now: NOW, code: code([]) });

    expect(report.periods.weeks.from).toBe(report.weeks[0]?.start);
    expect(report.periods.days.from).toBe(report.days[0]?.start);
    expect(report.periods.weeks.to).toBe(formatLocalIso(NOW));
    expect(report.periods.days.to).toBe(formatLocalIso(NOW));
  });
});
