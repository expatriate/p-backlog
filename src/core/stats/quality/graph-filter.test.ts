import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import { taskHistories } from "../history";
import { period } from "../period";
import { graphFilterEffect } from "./graph-filter";

const at = (day: number) => new Date(2026, 8, day, 12);
const iso = (day: number) => formatLocalIso(at(day));
const WHOLE_MONTH = period(at(1).getTime(), at(30).getTime());
const journal = (events: JournalEvent[]) => [{ projectId: "spa", events, invalidLines: 0 }];

const filtered = (task: string, day: number): JournalEvent => ({ at: iso(day), task, via: "check", kind: "candidate-filtered", symbol: "uploadFile" });
const candidate = (task: string, day: number): JournalEvent => ({ at: iso(day), task, via: "check", kind: "candidate", evidence: "source-changed", mode: "changed", method: "symbol" });
const status = (task: string, day: number, from: "backlog" | "in-progress", to: "in-progress" | "done", resolution?: "fixed" | "duplicate"): JournalEvent => ({
  at: iso(day),
  task,
  via: "cli",
  kind: "status",
  from,
  to,
  ...(resolution === undefined ? {} : { resolution }),
});

describe("эффект фильтра графа", () => {
  it("отсеянный кандидат: потом пойман проверкой, закрыт без сигнала (промах), взят в работу или закрыт дублем (без последствий)", () => {
    const tasks = ["SPA-1", "SPA-2", "SPA-3", "SPA-4", "SPA-5"].map((id) => makeTask({ id, created: iso(1) }));
    const events: JournalEvent[] = [
      filtered("SPA-1", 3),
      candidate("SPA-1", 5),
      status("SPA-1", 6, "backlog", "done", "fixed"),
      filtered("SPA-2", 3),
      status("SPA-2", 7, "backlog", "done", "fixed"),
      filtered("SPA-3", 3),
      status("SPA-3", 4, "backlog", "in-progress"),
      status("SPA-3", 5, "in-progress", "done", "fixed"),
      filtered("SPA-4", 3),
      status("SPA-4", 4, "backlog", "done", "duplicate"),
      filtered("SPA-5", 3),
    ];

    expect(graphFilterEffect(taskHistories(tasks, journal(events)), WHOLE_MONTH)).toEqual({ filtered: 5, caught: 1, missed: 1, quiet: 3 });
  });

  it("промах приписан последнему отсеву перед закрытием, а не каждому", () => {
    const tasks = [makeTask({ id: "SPA-1", created: iso(1) })];
    const events: JournalEvent[] = [filtered("SPA-1", 3), filtered("SPA-1", 5), status("SPA-1", 7, "backlog", "done", "fixed")];

    expect(graphFilterEffect(taskHistories(tasks, journal(events)), WHOLE_MONTH)).toEqual({ filtered: 2, caught: 0, missed: 1, quiet: 1 });
  });
});
