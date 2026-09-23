import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { ZodType } from "zod";
import { projectActiveSchema, projectDeleteSchema, updateTaskRequestSchema, type ProjectView } from "../core/api/contract";
import { projectGraphHealth, type GraphState } from "../core/check/graph-health";
import { buildIndex, type BacklogIndex } from "../core/model/graph";
import type { Project } from "../core/model/types";
import { issueWithoutPath, parseInRussian } from "../core/model/zod-issues";
import { loadBacklog, type LoadedBacklog } from "../core/store/load";
import { deleteProject, setProjectActive } from "../core/store/projects";
import { updateTaskInIndex } from "../core/store/update";
import type { Invalid } from "../core/store/write-result";
import type { ChangeFeed } from "./change-feed";
import type { MemorySampler } from "./memory-sampler";
import { createReportCache } from "./report-cache";
import { createStatsApi } from "./stats-api";
import type { UsageScanner } from "./usage-scanner";

export type ApiOptions = { root: string; changes: ChangeFeed; now: () => Date; home: string; usage: UsageScanner; memory: MemorySampler };

type BacklogSnapshot = LoadedBacklog & { index: BacklogIndex };

const GRAPH_STATE_TTL_MS = 60 * 1000;

export function createApi({ root, changes, now, home, usage, memory }: ApiOptions): Hono {
  const api = new Hono();
  let snapshot: Promise<BacklogSnapshot> | null = null;
  const backlog = (): Promise<BacklogSnapshot> => {
    snapshot ??= loadSnapshot(root).catch((error: unknown) => {
      snapshot = null;
      throw error;
    });
    return snapshot;
  };
  const stats = createStatsApi({ root, now, home, usage, memory, backlog });
  const graphStates = createReportCache({ ttlMs: GRAPH_STATE_TTL_MS, now: () => now().getTime() });
  const forgetBacklog = () => {
    snapshot = null;
    stats.forget();
  };
  changes.subscribe(forgetBacklog);

  api.get("/projects", async (c) => {
    const { projects, tasks } = await backlog();
    const withGraph = async (project: Project): Promise<ProjectView> => {
      const codeGraph = await graphStates.get<GraphState>(project.id, async () => (await projectGraphHealth(project, tasks, home)).state);
      return { ...project, codeGraph };
    };
    return c.json(await Promise.all(projects.map(withGraph)));
  });

  api.get("/tasks", async (c) => {
    const { tasks, errors } = await backlog();
    return c.json({ tasks, errors });
  });

  api.route("/", stats.routes);

  api.patch("/tasks/:id", async (c) => {
    const body = await readBody(c, updateTaskRequestSchema);
    if (!body.ok) return body.response;

    const id = c.req.param("id");
    const { index } = await backlog();
    const result = await updateTaskInIndex(index, { id, changes: body.data.changes, expectedVersion: body.data.version, now: now(), via: "web" });
    forgetBacklog();
    if (result.ok) return c.json(result.task);
    if (result.reason === "not-found") return c.json({ errors: [`Задача ${id} не найдена`] }, 404);
    if (result.reason === "conflict") return c.json({ errors: ["Задача изменилась на диске"], current: result.current }, 409);
    return invalidResponse(c, result);
  });

  api.patch("/projects/:id", async (c) => {
    const body = await readBody(c, projectActiveSchema);
    if (!body.ok) return body.response;

    const id = c.req.param("id");
    const result = await setProjectActive(root, id, body.data.active);
    forgetBacklog();
    if (result.ok) return c.json(result.project);
    if (result.reason === "invalid") return c.json({ errors: [result.message] }, 422);
    return c.json({ errors: [`Проект ${id} не найден`] }, 404);
  });

  api.delete("/projects/:id", async (c) => {
    const body = await readBody(c, projectDeleteSchema);
    if (!body.ok) return body.response;

    const id = c.req.param("id");
    if (body.data.confirm !== id) return c.json({ errors: ["Подтверждение не совпадает с id проекта"] }, 422);
    const result = await deleteProject(root, id);
    forgetBacklog();
    return result.ok ? c.json({ deleted: id }) : c.json({ errors: [`Проект ${id} не найден`] }, 404);
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

async function loadSnapshot(root: string): Promise<BacklogSnapshot> {
  const loaded = await loadBacklog(root);
  return { ...loaded, index: buildIndex(loaded.tasks) };
}

function invalidResponse(c: Context, result: Invalid) {
  return c.json({ errors: result.errors }, 422);
}

type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: Response };

async function readBody<T>(c: Context, schema: ZodType<T>): Promise<ParsedBody<T>> {
  const body = await readJson(c);
  if (body.ok === false) return { ok: false, response: c.json({ errors: ["Тело запроса не разобрано: ожидается JSON"] }, 400) };
  const parsed = parseInRussian(schema, body.value, issueWithoutPath);
  return parsed.ok ? { ok: true, data: parsed.value } : { ok: false, response: c.json({ errors: parsed.errors }, 422) };
}

async function readJson(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}
