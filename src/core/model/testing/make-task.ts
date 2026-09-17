import type { Task } from "../types";

export function makeTask(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    title: overrides.id,
    type: "task",
    status: "backlog",
    priority: "medium",
    tags: [],
    blockedBy: [],
    related: [],
    created: "2026-09-17T10:00:00+03:00",
    extra: {},
    body: "",
    projectId: "spa",
    path: `/backlog/spa/${overrides.id}.md`,
    version: "v1",
    ...overrides,
  };
}
