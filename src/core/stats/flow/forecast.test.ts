import { describe, expect, it } from "vitest";
import type { JournalEvent, ProjectJournal } from "../../journal/events";
import { DAY_MS, formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import type { Task } from "../../model/types";
import { reportContext } from "../scope";
import { flowForecast } from "./forecast";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const NOW = at(18);
const open = (id: string, created: string) => makeTask({ id, created });
const closed = (id: string, created: string, closedAt: string) => makeTask({ id, created, status: "done", closed: closedAt });
const OLD = formatLocalIso(new Date(2026, 7, 1, 12));
const forecastOf = (tasks: Task[], openCount: number, journals: ProjectJournal[] = []) => flowForecast(reportContext({ tasks, journals, now: NOW, unparsedTasks: [] }), openCount);

describe("прогноз", () => {
  it("долг уменьшается: недели вверх и дата", () => {
    const tasks = [...["SPA-1", "SPA-2", "SPA-3", "SPA-4", "SPA-5"].map((id) => closed(id, OLD, iso(10))), open("SPA-6", iso(12)), open("SPA-7", OLD), open("SPA-8", OLD)];

    const forecast = forecastOf(tasks, 3);

    expect(forecast).toMatchObject({ closed: 5, created: 1, open: 3, weeklyNet: 1, weeks: 3 });
    expect(forecast.until).toBe(formatLocalIso(new Date(2026, 9, 9, 12)));
  });

  it("переоткрытая и снова закрытая в окне задача ускоряет прогноз одним закрытием, а не двумя", () => {
    const events: JournalEvent[] = [
      { at: iso(12), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "done" },
      { at: iso(13), task: "SPA-1", via: "web", kind: "status", from: "done", to: "backlog" },
      { at: iso(16), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "done" },
    ];

    const forecast = forecastOf([closed("SPA-1", OLD, iso(16)), open("SPA-2", OLD)], 1, [{ projectId: "spa", events, invalidLines: 0 }]);

    expect(forecast).toMatchObject({ closed: 1 });
  });

  it("долг не уменьшается и растёт — без недель", () => {
    const flat = forecastOf([closed("SPA-1", OLD, iso(10)), open("SPA-2", iso(11))], 1);
    const growing = forecastOf([open("SPA-1", iso(11)), open("SPA-2", iso(12))], 2);

    expect(flat).toMatchObject({ weeklyNet: 0, weeks: null, until: null });
    expect(growing).toMatchObject({ closed: 0, created: 2, weeklyNet: -2, windowDays: 7, weeks: null, until: null });
  });

  it("открытых задач нет — без недель", () => {
    const forecast = forecastOf([closed("SPA-1", OLD, iso(10))], 0);

    expect(forecast).toMatchObject({ open: 0, weeks: null, until: null });
  });

  it("округление вверх до целого числа недель", () => {
    const exact = forecastOf([...["SPA-1", "SPA-2", "SPA-3"].map((id) => closed(id, OLD, iso(10))), open("SPA-4", iso(11))], 3);
    const fractional = forecastOf(
      ["SPA-1", "SPA-2", "SPA-3", "SPA-4", "SPA-5"].map((id) => closed(id, OLD, iso(10))),
      3,
    );

    expect(exact).toMatchObject({ closed: 3, created: 1, weeklyNet: 0.5, weeks: 6 });
    expect(fractional).toMatchObject({ closed: 5, created: 0, weeklyNet: 1.25, weeks: 3 });
  });

  it("беклог моложе окна — рост долга считается по его возрасту, а не по полному окну", () => {
    const tasks = ["SPA-1", "SPA-2", "SPA-3", "SPA-4"].map((id) => open(id, iso(13)));

    const forecast = forecastOf(tasks, 4);

    expect(forecast).toMatchObject({ created: 4, weeklyNet: -4, windowDays: 7 });
  });

  it("сразу за недельной границей скорость делится на настоящий возраст беклога, а не на лишнюю неделю", () => {
    const tasks = ["SPA-1", "SPA-2", "SPA-3", "SPA-4", "SPA-5", "SPA-6", "SPA-7", "SPA-8"].map((id) => open(id, iso(10)));

    const forecast = forecastOf(tasks, 8);

    expect(forecast).toMatchObject({ created: 8, weeklyNet: -7, windowDays: 8 });
  });

  it("границы окна: −28 дней исключены, «сейчас» включено", () => {
    const nowMs = NOW.getTime();
    const excluded = forecastOf([closed("SPA-1", OLD, formatLocalIso(new Date(nowMs - 28 * DAY_MS)))], 1);
    const included = forecastOf([closed("SPA-1", OLD, formatLocalIso(new Date(nowMs)))], 1);

    expect(excluded.closed).toBe(0);
    expect(included.closed).toBe(1);
  });
});
