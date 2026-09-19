import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import type { Task, TaskStatus } from "../../model/types";
import { taskHistories } from "../history";
import { flowEpics } from "./epics";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const NOW = at(18);
const open = (id: string, created: string) => makeTask({ id, created });
const closed = (id: string, created: string, closedAt: string) => makeTask({ id, created, status: "done", closed: closedAt });
const OLD = formatLocalIso(new Date(2026, 7, 1, 12));

describe("эпики", () => {
  const epic = (id: string, status: TaskStatus = "backlog") => makeTask({ id, type: "epic", created: OLD, status });
  const child = (task: Task, epicId: string): Task => ({ ...task, epic: epicId });

  it("прогресс, прогноз по темпу задач эпика, порядок по открытым", () => {
    const tasks = [
      epic("SPA-10"),
      child(closed("SPA-11", OLD, iso(10)), "SPA-10"),
      child(open("SPA-12", OLD), "SPA-10"),
      child(open("SPA-13", OLD), "SPA-10"),
      epic("SPA-20"),
      child(open("SPA-21", OLD), "SPA-20"),
      epic("SPA-30"),
      child(closed("SPA-31", OLD, iso(10)), "SPA-30"),
      epic("SPA-40"),
      epic("SPA-50", "done"),
    ];

    const epics = flowEpics(tasks, taskHistories(tasks, []), NOW);

    expect(epics).toEqual([
      { id: "SPA-10", projectId: "spa", title: "SPA-10", closed: 1, total: 3, weeks: 8 },
      { id: "SPA-20", projectId: "spa", title: "SPA-20", closed: 0, total: 1, weeks: null },
      { id: "SPA-30", projectId: "spa", title: "SPA-30", closed: 1, total: 1, weeks: 0 },
      { id: "SPA-40", projectId: "spa", title: "SPA-40", closed: 0, total: 0, weeks: null },
    ]);
  });

  it("не больше восьми эпиков", () => {
    const tasks = Array.from({ length: 9 }, (_, index) => epic(`SPA-${index + 1}`));

    expect(flowEpics(tasks, taskHistories(tasks, []), NOW)).toHaveLength(8);
  });
});
