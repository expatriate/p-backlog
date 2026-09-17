import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { newEpicRequestSchema, newTaskRequestSchema, updateTaskRequestSchema } from "../core/api/contract";
import type { Project } from "../core/model/types";
import { formatIssues } from "../core/model/zod-issues";
import { createTask } from "../core/store/create";
import { createEpic } from "../core/store/epics";
import { loadBacklog } from "../core/store/load";
import { updateTask } from "../core/store/update";
import type { Invalid } from "../core/store/write-result";
import type { ChangeFeed } from "./change-feed";

export type ApiOptions = { root: string; changes: ChangeFeed; now: () => Date };

export function createApi({ root, changes, now }: ApiOptions): Hono {
  const api = new Hono();

  api.get("/projects", async (c) => c.json((await loadBacklog(root)).projects));

  api.get("/tasks", async (c) => {
    const { tasks, errors } = await loadBacklog(root);
    return c.json({ tasks, errors });
  });

  api.post("/tasks", async (c) => {
    const request = newTaskRequestSchema.safeParse(await readJson(c));
    if (!request.success) return c.json({ errors: formatIssues(request.error) }, 422);
    const { projectId, ...input } = request.data;

    const loaded = await loadBacklog(root);
    const project = findProject(loaded.projects, projectId);
    if (!project) return projectNotFound(c, projectId);

    const created = await createTask(root, { project, input, existingTasks: loaded.tasks, now: now() });
    return created.ok ? c.json(created.task, 201) : invalidResponse(c, created);
  });

  api.patch("/tasks/:id", async (c) => {
    const request = updateTaskRequestSchema.safeParse(await readJson(c));
    if (!request.success) return c.json({ errors: formatIssues(request.error) }, 422);

    const id = c.req.param("id");
    const result = await updateTask(root, { id, changes: request.data.changes, expectedVersion: request.data.version });
    if (result.ok) return c.json(result.task);
    if (result.reason === "not-found") return c.json({ errors: [`Задача ${id} не найдена`] }, 404);
    if (result.reason === "conflict") return c.json({ errors: ["Задача изменилась на диске"], current: result.current }, 409);
    return invalidResponse(c, result);
  });

  api.post("/epics", async (c) => {
    const request = newEpicRequestSchema.safeParse(await readJson(c));
    if (!request.success) return c.json({ errors: formatIssues(request.error) }, 422);
    const { projectId, ...input } = request.data;

    const loaded = await loadBacklog(root);
    const project = findProject(loaded.projects, projectId);
    if (!project) return projectNotFound(c, projectId);

    const created = await createEpic(root, { project, ...input, now: now() });
    if (created.ok) return c.json({ epic: created.epic, tasks: created.tasks }, 201);
    return c.json({ errors: created.errors }, 422);
  });

  api.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = changes.subscribe(() => void stream.writeSSE({ event: "change", data: "" }));
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          unsubscribe();
          resolve();
        });
      });
    }),
  );

  return api;
}

function findProject(projects: readonly Project[], projectId: string): Project | undefined {
  return projects.find((project) => project.id === projectId);
}

function projectNotFound(c: Context, projectId: string) {
  return c.json({ errors: [`Проект ${projectId} не найден`] }, 404);
}

function invalidResponse(c: Context, result: Invalid) {
  return c.json({ errors: result.errors }, 422);
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
