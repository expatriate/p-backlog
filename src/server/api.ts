import { Hono, type Context } from "hono";
import { dirname, join } from "node:path";
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
  type Revision,
  type SettingsResponse,
  type TasksResponse,
} from "../core/api/contract";
import { projectGraphHealth } from "../core/check/graph-health";
import { errorText } from "../core/errors";
import { tasksClosedInWeb } from "../core/journal/closed-in-web";
import type { ProjectJournal } from "../core/journal/events";
import { buildIndex, type BacklogIndex } from "../core/model/graph";
import type { Project, Task } from "../core/model/types";
import { coreMessages, type CoreMessages } from "../core/messages";
import { parseWithLocale } from "../core/model/zod-issues";
import { applyBatch, type CoreBatchOutcome } from "../core/store/batch";
import { JOURNAL_FILE } from "../core/store/journal";
import { loadBacklog, type LoadedBacklog } from "../core/store/load";
import { writeSettings } from "../core/store/settings";
import { deleteProject, setProjectActive } from "../core/store/projects";
import { updateTaskInIndex } from "../core/store/update";
import type { Invalid } from "../core/store/write-result";
import type { ChangeFeed } from "./change-feed";
import { errorResponse, fileBusyResponse } from "./error-response";
import { createJournalSources, type JournalSources } from "./journal-sources";
import { serverMessages, type LocalizedWarn, type ServerMessages } from "./messages";
import { createTtlCache } from "./ttl-cache";
import { createRevisions, type OwnWrite } from "./revisions";
import { createStatsApi, type GraphHealthOf, type StatsServices } from "./stats-api";

export type ApiOptions = { root: string; readLanguage: () => Promise<Language>; changes: ChangeFeed; now: () => Date; home: string; statsServices: StatsServices };

type IndexedBacklog = LoadedBacklog & { index: BacklogIndex; closedInWeb: string[]; revision: Revision };

const GRAPH_STATE_TTL_MS = 60 * 1000;

export function createApi({ root, readLanguage, changes, now, home, statsServices }: ApiOptions): Hono {
  const api = new Hono();
  const revisions = createRevisions();
  const journalSources = createJournalSources(root);
  let snapshot: Promise<IndexedBacklog> | null = null;
  const backlog = (): Promise<IndexedBacklog> => {
    if (snapshot !== null) return snapshot;
    const loading = loadSnapshot(root, revisions.current(), journalSources, statsServices.warn).catch((error: unknown) => {
      if (snapshot === loading) snapshot = null;
      throw error;
    });
    snapshot = loading;
    return loading;
  };
  const graphHealths = createTtlCache({ ttlMs: GRAPH_STATE_TTL_MS, now: () => now().getTime() });
  const graphHealth: GraphHealthOf = ({ tasks }, project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const key = JSON.stringify([project.id, project.repos, projectTasks.map((task) => task.version)]);
    return graphHealths.get(key, () => projectGraphHealth(project, projectTasks, home));
  };
  const stats = createStatsApi({ root, readLanguage, now, home, services: statsServices, backlog, graphHealth, journalSources });
  const forgetAll = () => {
    snapshot = null;
    stats.forgetAll();
  };
  const forgetChanged = (paths: readonly string[]) => {
    snapshot = null;
    stats.forgetChanged(paths);
  };
  const forgettingOnFailure = <T>(write: Promise<T>): Promise<T> =>
    write.catch((error: unknown) => {
      forgetAll();
      throw error;
    });
  const recordOwnWrites = async (writes: readonly OwnWrite[]) => {
    if (writes.length === 0) {
      snapshot = null;
      return;
    }
    await revisions.recordOwnWrites(writes, [...new Set(writes.map((write) => join(dirname(write.path), JOURNAL_FILE)))]);
    forgetChanged(writes.map((write) => write.path));
  };
  const streams = new Set<(revision: Revision) => void>();
  changes.subscribe(async (paths) => {
    if ((await revisions.settle(paths)) === "foreign") forgetChanged(paths);
    else stats.forgetChanged(paths);
    const revision = revisions.current();
    for (const send of streams) send(revision);
  });

  api.get("/projects", async (c) => {
    const loaded = await backlog();
    const { projects, revision } = loaded;
    const withGraph = async (project: Project): Promise<ProjectView> => ({ ...project, codeGraph: (await graphHealth(loaded, project)).state });
    return c.json<ProjectsResponse>({ projects: await Promise.all(projects.map(withGraph)), revision });
  });

  api.get("/tasks", async (c) => {
    const [{ tasks, closedInWeb, errors, revision }, language] = await Promise.all([backlog(), readLanguage()]);
    const messages = coreMessages(language);
    return c.json<TasksResponse>({ tasks, closedInWeb, errors: errors.map(({ problems, ...error }) => ({ ...error, message: messages.problems(problems) })), revision });
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
    const result = await forgettingOnFailure(updateTaskInIndex(index, { id, changes: body.data.changes, expectedVersion: body.data.version, now: now(), via: "web" }));
    await recordOwnWrites(result.ok ? writtenTasks(result) : []);
    if (result.ok) return c.json(result.task);
    const messages = serverMessages(body.language);
    if (result.reason === "not-found") return errorResponse(c, 404, messages.taskNotFound(id));
    if (result.reason === "conflict") return c.json<ConflictResponse>({ errors: [messages.taskChangedOnDisk], current: result.current }, 409);
    if (result.reason === "busy") return fileBusyResponse(c, body.language, result);
    return invalidResponse(c, result, coreMessages(body.language));
  });

  api.post("/tasks/batch", async (c) => {
    const body = await readBody(c, batchRequestSchema, readLanguage);
    if (!body.ok) return body.response;

    const { index } = await backlog();
    const outcomes = await forgettingOnFailure(applyBatch(index, { ...body.data, now: now() }));
    await recordOwnWrites(outcomes.flatMap((outcome) => (outcome.outcome === "done" ? writtenTasks(outcome) : [])));
    const messages = serverMessages(body.language);
    const core = coreMessages(body.language);
    return c.json<BatchResponse>({ results: outcomes.map((outcome) => viewOf(outcome, messages, core)) });
  });

  api.patch("/projects/:id", async (c) => {
    const body = await readBody(c, projectActiveSchema, readLanguage);
    if (!body.ok) return body.response;

    const id = c.req.param("id");
    const result = await setProjectActive(root, id, body.data.active).finally(forgetAll);
    if (result.ok) return c.json(result.project);
    if (result.reason === "invalid") return errorResponse(c, 422, coreMessages(body.language).problems(result.problems));
    return errorResponse(c, 404, serverMessages(body.language).projectNotFound(id));
  });

  api.delete("/projects/:id", async (c) => {
    const body = await readBody(c, projectDeleteSchema, readLanguage);
    if (!body.ok) return body.response;

    const id = c.req.param("id");
    const messages = serverMessages(body.language);
    if (body.data.confirm !== id) return errorResponse(c, 422, messages.confirmMismatch);
    const result = await deleteProject(root, id).finally(forgetAll);
    return result.ok ? c.json({ deleted: id }) : errorResponse(c, 404, messages.projectNotFound(id));
  });

  api.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      const send = (revision: Revision) => void stream.writeSSE({ event: "change", data: JSON.stringify(revision) });
      streams.add(send);
      const clientGone = new Promise<void>((resolve) => stream.onAbort(resolve));
      await Promise.race([clientGone, changes.closed]);
      streams.delete(send);
    }),
  );

  return api;
}

async function loadSnapshot(root: string, revision: Revision, journalSources: JournalSources, warn: LocalizedWarn): Promise<IndexedBacklog> {
  const loaded = await loadBacklog(root);
  const projectIds = loaded.projects.map((project) => project.id);
  journalSources.retain(projectIds);
  const readableJournal = (projectId: string): Promise<ProjectJournal> =>
    journalSources.journal(projectId).catch(async (error: unknown) => {
      await warn((messages) => messages.journalReadFailed(join(root, projectId, JOURNAL_FILE), errorText(error)));
      return { projectId, events: [], invalidLines: 0 };
    });
  const journals = await Promise.all(projectIds.map(readableJournal));
  return { ...loaded, index: buildIndex(loaded.tasks), closedInWeb: tasksClosedInWeb(loaded.tasks, journals), revision };
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
  const parsed = parseWithLocale(schema, body.value, language);
  return parsed.ok ? { ok: true, data: parsed.value, language } : { ok: false, response: errorResponse(c, 422, ...parsed.errors) };
}

async function readJson(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}
