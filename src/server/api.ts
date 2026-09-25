import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { ZodType } from "zod";
import type { Language } from "../core/i18n/language";
import { projectActiveSchema, projectDeleteSchema, settingsRequestSchema, updateTaskRequestSchema, type ProjectView, type SettingsResponse } from "../core/api/contract";
import { projectGraphHealth, type GraphState } from "../core/check/graph-health";
import { buildIndex, type BacklogIndex } from "../core/model/graph";
import type { Project } from "../core/model/types";
import { coreMessages, type CoreMessages } from "../core/messages";
import { parseWithLocale } from "../core/model/zod-issues";
import { loadBacklog, type LoadedBacklog } from "../core/store/load";
import { writeSettings } from "../core/store/settings";
import { deleteProject, setProjectActive } from "../core/store/projects";
import { updateTaskInIndex } from "../core/store/update";
import type { Invalid } from "../core/store/write-result";
import type { ChangeFeed } from "./change-feed";
import { serverMessages } from "./messages";
import type { MemorySampler } from "./memory-sampler";
import { createReportCache } from "./report-cache";
import { createStatsApi } from "./stats-api";
import type { UsageScanner } from "./usage-scanner";

export type ApiOptions = { root: string; readLanguage: () => Promise<Language>; changes: ChangeFeed; now: () => Date; home: string; usage: UsageScanner; memory: MemorySampler; warn: (line: string) => void };

type BacklogSnapshot = LoadedBacklog & { index: BacklogIndex };

const GRAPH_STATE_TTL_MS = 60 * 1000;

export function createApi({ root, readLanguage, changes, now, home, usage, memory, warn }: ApiOptions): Hono {
  const api = new Hono();
  let snapshot: Promise<BacklogSnapshot> | null = null;
  const backlog = (): Promise<BacklogSnapshot> => {
    snapshot ??= loadSnapshot(root).catch((error: unknown) => {
      snapshot = null;
      throw error;
    });
    return snapshot;
  };
  const stats = createStatsApi({ root, readLanguage, now, home, usage, memory, warn, backlog });
  const graphStates = createReportCache({ ttlMs: GRAPH_STATE_TTL_MS, now: () => now().getTime() });
  const forgetBacklog = () => {
    snapshot = null;
    stats.forget();
    graphStates.clear();
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
    const [{ tasks, errors }, language] = await Promise.all([backlog(), readLanguage()]);
    const messages = coreMessages(language);
    return c.json({ tasks, errors: errors.map(({ problems, ...error }) => ({ ...error, message: messages.problems(problems) })) });
  });

  api.route("/", stats.routes);

  api.get("/settings", async (c) => c.json<SettingsResponse>({ language: await readLanguage() }));

  api.patch("/settings", async (c) => {
    const body = await readBody(c, settingsRequestSchema, readLanguage);
    if (!body.ok) return body.response;

    await writeSettings(root, body.data);
    return c.json<SettingsResponse>({ language: body.data.language });
  });

  api.patch("/tasks/:id", async (c) => {
    const body = await readBody(c, updateTaskRequestSchema, readLanguage);
    if (!body.ok) return body.response;

    const id = c.req.param("id");
    const { index } = await backlog();
    const result = await updateTaskInIndex(index, { id, changes: body.data.changes, expectedVersion: body.data.version, now: now(), via: "web" });
    forgetBacklog();
    if (result.ok) return c.json(result.task);
    const messages = serverMessages(body.language);
    if (result.reason === "not-found") return c.json({ errors: [messages.taskNotFound(id)] }, 404);
    if (result.reason === "conflict") return c.json({ errors: [messages.taskChangedOnDisk], current: result.current }, 409);
    return invalidResponse(c, result, coreMessages(body.language));
  });

  api.patch("/projects/:id", async (c) => {
    const body = await readBody(c, projectActiveSchema, readLanguage);
    if (!body.ok) return body.response;

    const id = c.req.param("id");
    const result = await setProjectActive(root, id, body.data.active);
    forgetBacklog();
    if (result.ok) return c.json(result.project);
    if (result.reason === "invalid") return c.json({ errors: [coreMessages(body.language).problems(result.problems)] }, 422);
    return c.json({ errors: [serverMessages(body.language).projectNotFound(id)] }, 404);
  });

  api.delete("/projects/:id", async (c) => {
    const body = await readBody(c, projectDeleteSchema, readLanguage);
    if (!body.ok) return body.response;

    const id = c.req.param("id");
    const messages = serverMessages(body.language);
    if (body.data.confirm !== id) return c.json({ errors: [messages.confirmMismatch] }, 422);
    const result = await deleteProject(root, id);
    forgetBacklog();
    return result.ok ? c.json({ deleted: id }) : c.json({ errors: [messages.projectNotFound(id)] }, 404);
  });

  api.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = changes.subscribe(() => void stream.writeSSE({ event: "change", data: "" }));
      const clientGone = new Promise<void>((resolve) => stream.onAbort(resolve));
      await Promise.race([clientGone, changes.closed]);
      unsubscribe();
    }),
  );

  return api;
}

async function loadSnapshot(root: string): Promise<BacklogSnapshot> {
  const loaded = await loadBacklog(root);
  return { ...loaded, index: buildIndex(loaded.tasks) };
}

function invalidResponse(c: Context, result: Invalid, messages: CoreMessages) {
  return c.json({ errors: result.errors.map(messages.problem) }, 422);
}

type ParsedBody<T> = { ok: true; data: T; language: Language } | { ok: false; response: Response };

async function readBody<T>(c: Context, schema: ZodType<T>, readLanguage: () => Promise<Language>): Promise<ParsedBody<T>> {
  const [body, language] = await Promise.all([readJson(c), readLanguage()]);
  if (body.ok === false) return { ok: false, response: c.json({ errors: [serverMessages(language).bodyNotParsed] }, 400) };
  const parsed = parseWithLocale(schema, body.value, language);
  return parsed.ok ? { ok: true, data: parsed.value, language } : { ok: false, response: c.json({ errors: parsed.errors }, 422) };
}

async function readJson(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}
