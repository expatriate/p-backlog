import { describe, expect, it } from "vitest";
import { formatLocalIso } from "./dates";
import { changeStatus, deletionDate, epicsToClose, isExpired, settleLifecycle } from "./lifecycle";
import { makeTask } from "./testing/make-task";

const NOW = new Date("2026-09-18T12:00:00Z");
const CLOSED_AT = "2026-09-10T09:00:00+03:00";

describe("changeStatus", () => {
  it("открытая → закрытая: ставит closed и причину автозакрытия", () => {
    const task = makeTask({ id: "SPA-1" });
    const closed = changeStatus(task, "done", NOW, { resolution: "fixed", reason: "Исправлено в a1b2c3d" });
    expect(closed).toMatchObject({ status: "done", closed: formatLocalIso(NOW), resolution: "fixed", reason: "Исправлено в a1b2c3d" });
  });

  it("закрытая → открытая: стирает closed, resolution и reason", () => {
    const task = makeTask({ id: "SPA-1", status: "cancelled", closed: CLOSED_AT, resolution: "obsolete", reason: "кода нет" });
    const reopened = changeStatus(task, "backlog", NOW);
    expect(reopened.status).toBe("backlog");
    expect([reopened.closed, reopened.resolution, reopened.reason]).toEqual([undefined, undefined, undefined]);
  });

  it("закрытая → другая закрытая: closed сохраняется, причина стирается — решил человек", () => {
    const task = makeTask({ id: "SPA-1", status: "cancelled", closed: CLOSED_AT, resolution: "duplicate", reason: "дубль SPA-2" });
    const done = changeStatus(task, "done", NOW);
    expect(done).toMatchObject({ status: "done", closed: CLOSED_AT });
    expect([done.resolution, done.reason]).toEqual([undefined, undefined]);
  });

  it("тот же статус ничего не меняет", () => {
    const task = makeTask({ id: "SPA-1", status: "done", closed: CLOSED_AT, resolution: "fixed", reason: "есть" });
    expect(changeStatus(task, "done", NOW)).toBe(task);
  });
});

describe("settleLifecycle", () => {
  it("закрытой задаче без closed ставит текущий момент", () => {
    expect(settleLifecycle(makeTask({ id: "SPA-1", status: "done" }), NOW).closed).toBe(formatLocalIso(NOW));
  });

  it("у открытой задачи убирает остатки закрытия", () => {
    const settled = settleLifecycle(makeTask({ id: "SPA-1", closed: CLOSED_AT, resolution: "fixed", reason: "есть" }), NOW);
    expect([settled.closed, settled.resolution, settled.reason]).toEqual([undefined, undefined, undefined]);
  });
});

describe("срок хранения", () => {
  it("задача удаляется через 7 дней после закрытия", () => {
    const task = makeTask({ id: "SPA-1", status: "done", closed: CLOSED_AT });
    expect(deletionDate(task)?.toISOString()).toBe("2026-09-17T06:00:00.000Z");
    expect(deletionDate(makeTask({ id: "SPA-2" }))).toBeUndefined();
  });

  it("у открытой задачи с оставшимся closed даты удаления нет", () => {
    expect(deletionDate(makeTask({ id: "SPA-1", closed: CLOSED_AT }))).toBeUndefined();
  });

  it("просрочена с момента удаления, не раньше; открытая не просрочена никогда", () => {
    const task = makeTask({ id: "SPA-1", status: "done", closed: CLOSED_AT });
    expect(isExpired(task, new Date("2026-09-17T05:59:59Z"))).toBe(false);
    expect(isExpired(task, new Date("2026-09-17T06:00:00Z"))).toBe(true);
    expect(isExpired(makeTask({ id: "SPA-2", closed: CLOSED_AT }), NOW)).toBe(false);
  });
});

describe("завершённый эпик", () => {
  const epic = makeTask({ id: "SPA-1", type: "epic" });
  const done = makeTask({ id: "SPA-2", epic: "SPA-1", status: "done", closed: CLOSED_AT });
  const cancelled = makeTask({ id: "SPA-3", epic: "SPA-1", status: "cancelled", closed: CLOSED_AT });

  it("открытый эпик, у которого все задачи закрыты, закрывается с перечнем задач в причине", () => {
    expect(epicsToClose([epic, done, cancelled], [])).toEqual([
      { epic, closure: { resolution: "epic-done", reason: "все задачи эпика закрыты: SPA-2, SPA-3" } },
    ]);
  });

  it("эпик без задач, с открытой задачей или уже закрытый не закрывается; обычная задача — не эпик", () => {
    const open = makeTask({ id: "SPA-4", epic: "SPA-1" });
    const closedEpic = { ...epic, status: "done" as const, closed: CLOSED_AT };
    const plainTask = makeTask({ id: "SPA-5" });
    const underPlainTask = makeTask({ id: "SPA-6", epic: "SPA-5", status: "done", closed: CLOSED_AT });
    expect(epicsToClose([epic], [])).toEqual([]);
    expect(epicsToClose([epic, done, open], [])).toEqual([]);
    expect(epicsToClose([closedEpic, done], [])).toEqual([]);
    expect(epicsToClose([plainTask, underPlainTask], [])).toEqual([]);
  });

  it("эпики закрываются, только когда разобраны все файлы: у неразобранного эпик неизвестен", () => {
    const parseError = { path: "/backlog/spa/SPA-9.md", projectId: "spa", message: "файл не начинается с frontmatter" };
    expect(epicsToClose([epic, done, cancelled], [parseError])).toEqual([]);
  });
});
