import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { ZodType } from "zod";
import type { Language } from "../core/i18n/language";
import {
  batchRequestSchema,
  projectActiveSchema,
  projectDeleteSchema,
  settingsRequestSchema,
  updateTaskRequestSchema,
  type BatchOutcome,
  type BatchResponse,
  type ConflictResponse,
  type ProjectsResponse,
  type ProjectView,
  type SettingsResponse,
  type TasksResponse,
} from "../core/api/contract";
import { projectGraphHealth } from "../core/check/graph-health";
import { warnPathErrors, type PathErrorHandler } from "../core/errors";
import type { Project, Task } from "../core/model/types";
import { coreMessages, type CoreMessages } from "../core/messages";
import { parseSchema } from "../core/model/zod-issues";
import { applyBatch, type CoreBatchOutcome } from "../core/store/batch";
import { writeSettings } from "../core/store/settings";
import { deleteProject, setProjectActive } from "../core/store/projects";
import { updateTaskInIndex } from "../core/store/update";
import type { Invalid } from "../core/store/write-result";
import type { ChangeFeed } from "./change-feed";
import { errorResponse, fileBusyResponse } from "./error-response";
import { createJournalSources } from "./journal-sources";
import { serverMessages, type ServerMessages } from "./messages";
import { createTtlCache } from "./ttl-cache";
import { createRevisions } from "./revisions";
import { createInvalidation, createSnapshotCache, type IndexedBacklog, type Invalidation } from "./snapshot-cache";
import { createStatsApi, type GraphHealthOf, type StatsServices } from "./stats-api";

export type ApiOptions = { root: string; readLanguage: () => Promise<Language>; changes: ChangeFeed; now: () => Date; home: string; statsServices: StatsServices };

type ApiDeps = Pick<ApiOptions, "root" | "readLanguage" | "now"> & { backlog: () => Promise<IndexedBacklog>; graphHealth: GraphHealthOf; invalidation: Invalidation; onWriteError: PathErrorHandler };

const GRAPH_STATE_TTL_MS = 60 * 1000;

export function createApi({ root, readLanguage, changes, now, home, statsServices }: ApiOptions): Hono {
  const revisions = createRevisions();
  const journalSources = createJournalSources(root);
  const snapshots = createSnapshotCache({ root, revisions, journalSources, warn: statsServices.warn });
  const graphHealth = rememberedGraphHealth(home, now);
  const stats = createStatsApi({ root, readLanguage, now, home, services: statsServices, backlog: snapshots.read, graphHealth, journalSources });
  const invalidation = createInvalidation({ revisions, snapshots, derived: stats, changes });
  const onWriteError = warnPathErrors((line) => void statsServices.warn(() => line));
  const deps: ApiDeps = { root, readLanguage, now, backlog: snapshots.read, graphHealth, invalidation, onWriteError };

  const api = new Hono();
  api.get("/projects", (c) => listProjects(c, deps));
  api.get("/tasks", (c) => listTasks(c, deps));
  api.route("/", stats.routes);
  api.get("/settings", async (c) => c.json<SettingsResponse>({ language: await readLanguage() }));
  api.patch("/settings", (c) => updateSettings(c, deps));
  api.patch("/tasks/:id", (c) => updateTask(c, c.req.param("id"), deps));
  api.post("/tasks/batch", (c) => updateTaskBatch(c, deps));
  api.patch("/projects/:id", (c) => setProjectActivity(c, c.req.param("id"), deps));
  api.delete("/projects/:id", (c) => removeProject(c, c.req.param("id"), deps));
  api.get("/events", (c) => revisionEvents(c, invalidation, changes.closed));
  return api;
}

function rememberedGraphHealth(home: string, now: () => Date): GraphHealthOf {
  const graphHealths = createTtlCache({ ttlMs: GRAPH_STATE_TTL_MS, now: () => now().getTime() });
  return ({ tasks }, project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const key = JSON.stringify([project.id, project.repos, projectTasks.map((task) => task.version)]);
    return graphHealths.get(key, () => projectGraphHealth(project, projectTasks, home));
  };
}

async function listProjects(c: Context, { backlog, graphHealth }: ApiDeps) {
  const loaded = await backlog();
  const { projects, revision } = loaded;
  const withGraph = async (project: Project): Promise<ProjectView> => ({ ...project, codeGraph: (await graphHealth(loaded, project)).state });
  return c.json<ProjectsResponse>({ projects: await Promise.all(projects.map(withGraph)), revision });
}

async function listTasks(c: Context, { backlog, readLanguage }: ApiDeps) {
  const [{ tasks, closedInWeb, errors, revision }, language] = await Promise.all([backlog(), readLanguage()]);
  const messages = coreMessages(language);
  return c.json<TasksResponse>({ tasks, closedInWeb, errors: errors.map(({ problems, ...error }) => ({ ...error, message: messages.problems(problems) })), revision });
}

async function updateSettings(c: Context, { root, readLanguage }: ApiDeps) {
  const body = await readBody(c, settingsRequestSchema, readLanguage);
  if (!body.ok) return body.response;

  await writeSettings(root, body.data);
  return c.json<SettingsResponse>({ language: body.data.language });
}

async function updateTask(c: Context, id: string, { readLanguage, backlog, now, invalidation, onWriteError }: ApiDeps) {
  const body = await readBody(c, updateTaskRequestSchema, readLanguage);
  if (!body.ok) return body.response;

  const { index } = await backlog();
  const result = await invalidation.forgettingOnFailure(updateTaskInIndex(index, { id, changes: body.data.changes, expectedVersion: body.data.version, now: now(), via: "web", onError: onWriteError }));
  await invalidation.recordOwnWrites(result.ok ? writtenTasks(result) : []);
  if (result.ok) return c.json(result.task);
  const messages = serverMessages(body.language);
  if (result.reason === "not-found") return errorResponse(c, 404, messages.taskNotFound(id));
  if (result.reason === "conflict") return c.json<ConflictResponse>({ errors: [messages.taskChangedOnDisk], current: result.current }, 409);
  if (result.reason === "busy") return fileBusyResponse(c, body.language, result);
  return invalidResponse(c, result, coreMessages(body.language));
}

async function updateTaskBatch(c: Context, { readLanguage, backlog, now, invalidation, onWriteError }: ApiDeps) {
  const body = await readBody(c, batchRequestSchema, readLanguage);
  if (!body.ok) return body.response;

  const { index } = await backlog();
  const outcomes = await invalidation.forgettingOnFailure(applyBatch(index, { ...body.data, now: now(), onError: onWriteError }));
  await invalidation.recordOwnWrites(outcomes.flatMap((outcome) => (outcome.outcome === "done" ? writtenTasks(outcome) : [])));
  const messages = serverMessages(body.language);
  const core = coreMessages(body.language);
  return c.json<BatchResponse>({ results: outcomes.map((outcome) => viewOf(outcome, messages, core)) });
}

async function setProjectActivity(c: Context, id: string, { root, readLanguage, invalidation }: ApiDeps) {
  const body = await readBody(c, projectActiveSchema, readLanguage);
  if (!body.ok) return body.response;

  const result = await setProjectActive(root, id, body.data.active).finally(invalidation.forgetAll);
  if (result.ok) return c.json(result.project);
  if (result.reason === "invalid") return errorResponse(c, 422, coreMessages(body.language).problems(result.problems));
  return errorResponse(c, 404, serverMessages(body.language).projectNotFound(id));
}

async function removeProject(c: Context, id: string, { root, readLanguage, invalidation }: ApiDeps) {
  const body = await readBody(c, projectDeleteSchema, readLanguage);
  if (!body.ok) return body.response;

  const messages = serverMessages(body.language);
  if (body.data.confirm !== id) return errorResponse(c, 422, messages.confirmMismatch);
  const result = await deleteProject(root, id).finally(invalidation.forgetAll);
  return result.ok ? c.json({ deleted: id }) : errorResponse(c, 404, messages.projectNotFound(id));
}

function revisionEvents(c: Context, invalidation: Invalidation, closed: Promise<void>) {
  return streamSSE(c, async (stream) => {
    const stopSending = invalidation.onRevision((revision) => void stream.writeSSE({ event: "change", data: JSON.stringify(revision) }));
    const clientGone = new Promise<void>((resolve) => stream.onAbort(resolve));
    await Promise.race([clientGone, closed]);
    stopSending();
  });
}

function invalidResponse(c: Context, result: Invalid, messages: CoreMessages) {
  return errorResponse(c, 422, ...result.problems.map(messages.problem));
}

function writtenTasks({ task, reopenedEpic }: { task: Task; reopenedEpic?: Task | undefined }): Task[] {
  return reopenedEpic === undefined ? [task] : [task, reopenedEpic];
}

function viewOf(outcome: CoreBatchOutcome, messages: ServerMessages, core: CoreMessages): BatchOutcome {
  if (outcome.outcome === "done") return { id: outcome.id, outcome: "done", version: outcome.task.version, previous: outcome.previous };
  if (outcome.reason === "failed") return { id: outcome.id, outcome: "skipped", reason: outcome.reason, message: messages.batchFailed(outcome.id, outcome.detail) };
  const message = outcome.reason === "invalid" && outcome.problems ? core.problems(outcome.problems) : messages.batchSkipped[outcome.reason](outcome.id);
  return { id: outcome.id, outcome: "skipped", reason: outcome.reason, message };
}

type ParsedBody<T> = { ok: true; data: T; language: Language } | { ok: false; response: Response };

async function readBody<T>(c: Context, schema: ZodType<T>, readLanguage: () => Promise<Language>): Promise<ParsedBody<T>> {
  const [body, language] = await Promise.all([readJson(c), readLanguage()]);
  if (body.ok === false) return { ok: false, response: errorResponse(c, 400, serverMessages(language).bodyNotParsed) };
  const parsed = parseSchema(schema, body.value);
  if (parsed.ok) return { ok: true, data: parsed.value, language };
  const { schemaIssue } = coreMessages(language);
  return { ok: false, response: errorResponse(c, 422, ...new Set(parsed.problems.map(({ issue }) => schemaIssue(issue)))) };
}

async function readJson(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}
