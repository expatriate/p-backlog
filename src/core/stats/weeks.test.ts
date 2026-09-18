import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../journal/events";
import { formatLocalIso } from "../model/dates";
import { makeTask } from "../model/testing/make-task";
import { taskHistories } from "./history";
import { weekStarts, weeklyFlow } from "./weeks";

const at = (month: number, day: number, hour = 12) => new Date(2026, month, day, hour);
const NOW = at(8, 18);

describe("недели", () => {
  it("12 недель с понедельника, последняя — текущая", () => {
    const starts = weekStarts(NOW, 12);

    expect(starts).toHaveLength(12);
    expect(starts.at(-1)).toEqual(new Date(2026, 8, 14));
    expect(starts[0]).toEqual(new Date(2026, 5, 29));
  });

  it("создано, закрыто и открыто на конец недели", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: formatLocalIso(at(8, 8)), status: "done", closed: formatLocalIso(at(8, 15)) }),
      makeTask({ id: "SPA-2", created: formatLocalIso(at(8, 15)) }),
    ];
    const events: JournalEvent[] = [];

    const weeks = weeklyFlow(taskHistories(tasks, [{ projectId: "spa", events, invalidLines: 0 }]), NOW);

    expect(weeks.slice(-2)).toEqual([
      { start: formatLocalIso(new Date(2026, 8, 7)), created: 1, closed: 0, openAtEnd: 1 },
      { start: formatLocalIso(new Date(2026, 8, 14)), created: 1, closed: 1, openAtEnd: 1 },
    ]);
  });
});
