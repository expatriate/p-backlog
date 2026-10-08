import { describe, expect, it } from "vitest";
import { makeTask } from "../../core/model/testing/make-task";
import { countOpenTasks } from "./scope";

describe("открытые задачи по области", () => {
  const inSpa = (task: { projectId: string }) => task.projectId === "spa";

  it("закрытые задачи не входят ни в область, ни в «вне области»", () => {
    const tasks = [
      makeTask({ id: "SPA-1" }),
      makeTask({ id: "SPA-2", status: "in-progress" }),
      makeTask({ id: "SPA-3", status: "done" }),
      makeTask({ id: "TI-1", projectId: "ti" }),
      makeTask({ id: "TI-2", projectId: "ti", status: "cancelled" }),
    ];

    expect(countOpenTasks(tasks, inSpa)).toEqual({ inScope: 2, outOfScope: 1 });
  });
});
