import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import { taskHistories } from "../history";
import { flowForecast } from "./forecast";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const NOW = at(18);
const open = (id: string, created: string) => makeTask({ id, created });
const closed = (id: string, created: string, closedAt: string) => makeTask({ id, created, status: "done", closed: closedAt });
const OLD = formatLocalIso(new Date(2026, 7, 1, 12));

describe("прогноз", () => {
  it("долг уменьшается: недели вверх и дата", () => {
    const tasks = [
      ...["SPA-1", "SPA-2", "SPA-3", "SPA-4", "SPA-5"].map((id) => closed(id, OLD, iso(10))),
      open("SPA-6", iso(12)),
      open("SPA-7", OLD),
      open("SPA-8", OLD),
    ];

    const forecast = flowForecast(taskHistories(tasks, []), 3, NOW);

    expect(forecast).toMatchObject({ closed: 5, created: 1, open: 3, weeklyNet: 1, weeks: 3 });
    expect(forecast.until).toBe(formatLocalIso(new Date(2026, 9, 9, 12)));
  });

  it("долг не уменьшается и растёт — без недель", () => {
    const flat = flowForecast(taskHistories([closed("SPA-1", OLD, iso(10)), open("SPA-2", iso(11))], []), 1, NOW);
    const growing = flowForecast(taskHistories([open("SPA-1", iso(11)), open("SPA-2", iso(12))], []), 2, NOW);

    expect(flat).toMatchObject({ weeklyNet: 0, weeks: null, until: null });
    expect(growing).toMatchObject({ closed: 0, created: 2, weeklyNet: -0.5, weeks: null, until: null });
  });

  it("открытых задач нет — без недель", () => {
    const forecast = flowForecast(taskHistories([closed("SPA-1", OLD, iso(10))], []), 0, NOW);

    expect(forecast).toMatchObject({ open: 0, weeks: null, until: null });
  });
});
