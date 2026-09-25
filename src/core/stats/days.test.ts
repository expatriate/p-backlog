import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../model/dates";
import { makeTask } from "../model/testing/make-task";
import { dailyFlow } from "./days";
import { taskHistories } from "./history";
import { sum } from "./numbers";
import { weeklyFlow } from "./weeks";

const at = (month: number, day: number, hour = 12) => new Date(2026, month, day, hour);
const NOW = at(8, 18);

describe("дни", () => {
  it("30 дней подряд, последний — сегодняшний", () => {
    const starts = dailyFlow([], NOW).map((day) => day.start);

    expect(starts).toHaveLength(30);
    expect(starts.at(-1)).toBe(formatLocalIso(new Date(2026, 8, 18)));
    expect(starts[0]).toBe(formatLocalIso(new Date(2026, 7, 20)));
  });

  it("создано, закрыто и открыто на конец дня", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: formatLocalIso(at(8, 16)), status: "done", closed: formatLocalIso(at(8, 17)) }),
      makeTask({ id: "SPA-2", created: formatLocalIso(at(8, 17)) }),
    ];

    const days = dailyFlow(taskHistories(tasks, []), NOW);

    expect(days.slice(-3)).toEqual([
      { start: formatLocalIso(new Date(2026, 8, 16)), created: 1, closed: 0, openAtEnd: 1 },
      { start: formatLocalIso(new Date(2026, 8, 17)), created: 1, closed: 1, openAtEnd: 1 },
      { start: formatLocalIso(new Date(2026, 8, 18)), created: 0, closed: 0, openAtEnd: 1 },
    ]);
  });

  it("завершённая неделя внутри 30 дней: сумма дней равна значениям недели", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: formatLocalIso(at(8, 7)), status: "done", closed: formatLocalIso(at(8, 9)) }),
      makeTask({ id: "SPA-2", created: formatLocalIso(at(8, 10)) }),
      makeTask({ id: "SPA-3", created: formatLocalIso(at(8, 12)), status: "done", closed: formatLocalIso(at(8, 12)) }),
    ];
    const histories = taskHistories(tasks, []);
    const weekStart = formatLocalIso(new Date(2026, 8, 7));
    const nextWeekStart = formatLocalIso(new Date(2026, 8, 14));

    const week = weeklyFlow(histories, NOW).find((candidate) => candidate.start === weekStart);
    const weekDays = dailyFlow(histories, NOW).filter((day) => day.start >= weekStart && day.start < nextWeekStart);

    expect(week).toMatchObject({ created: 3, closed: 2 });
    expect(weekDays).toHaveLength(7);
    expect(sum(weekDays.map((day) => day.created))).toBe(week?.created);
    expect(sum(weekDays.map((day) => day.closed))).toBe(week?.closed);
  });
});
