import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { ZodType } from "zod";
import { updateTaskRequestSchema } from "../core/api/contract";
import { createCodeCacheFile } from "../core/code/code-cache";
import { createCodeSource } from "../core/code/code-source";
import type { Project, Task } from "../core/model/types";
import { formatIssues } from "../core/model/zod-issues";
import { formatLocalDay } from "../core/model/dates";
import { costReport } from "../core/stats/cost/cost-report";
import { codeFixRequests, codeReport } from "../core/stats/code/code-report";
import { effectReport } from "../core/stats/effect/effect-report";
import { qualityReport } from "../core/stats/quality/quality-report";
import { statsReport } from "../core/stats/report";
import { reportBase, type StatsInput } from "../core/stats/scope";
import { statsSignals } from "../core/stats/signals/signals";
import type { CodeReport, CostReport, EffectReport, QualityReport, SignalsReport, StatsReport } from "../core/stats/types";
import { loadBacklog, type LoadedBacklog } from "../core/store/load";
import { readJournals } from "../core/store/journal";
import { readRuns } from "../core/store/runs";
import { findProjectForRepoRoot, findRepoRoot } from "../core/store/resolve-project";
import { updateTask } from "../core/store/update";
import type { UsageCache } from "../core/usage/usage-cache";
import type { Invalid } from "../core/store/write-result";
import type { ChangeFeed } from "./change-feed";
import type { MemorySampler } from "./memory-sampler";
import { createReportCache } from "./report-cache";
import type { UsageScanner } from "./usage-scanner";

export type ApiOptions = { root: string; changes: ChangeFeed; now: () => Date; home: string; usage: UsageScanner; memory: MemorySampler };

const REPORT_TTL_MS = 5 * 60 * 1000;

export function createApi({ root, changes, now, home, usage, memory }: ApiOptions): Hono {
  const api = new Hono();
  const reports = createReportCache({ ttlMs: REPORT_TTL_MS, now: () => now().getTime() });
  let snapshot: Promise<LoadedBacklog> | null = null;
  const backlog = (): Promise<LoadedBacklog> => {
    snapshot ??= loadBacklog(root).catch((error: unknown) => {
      snapshot = null;
      throw error;
    });
    return snapshot;
  };
  const forgetBacklog = () => {
    snapshot = null;
    reports.clear();
  };
  changes.subscribe(forgetBacklog);

  api.get("/projects", async (c) => c.json((await backlog()).projects));

  api.get("/tasks", async (c) => {
    const { tasks, errors } = await backlog();
    return c.json({ tasks, errors });
  });

  const codeSource = createCodeSource({ home, store: createCodeCacheFile(root) });

  const statsScopeOf = async (c: Context): Promise<{ projectId?: string | undefined; projects: Project[]; tasks: Task[] } | Response> => {
    const projectId = c.req.query("project") || undefined;
    const { projects, tasks } = await backlog();
    if (projectId !== undefined && !projects.some((project) => project.id === projectId)) {
      return c.json({ errors: [`Проект ${projectId} не найден`] }, 404);
    }
    if (projectId !== undefined) return { projectId, projects, tasks };
    const active = projects.filter((project) => project.active);
    const activeIds = new Set(active.map((project) => project.id));
    return { projectId, projects: active, tasks: tasks.filter((task) => activeIds.has(task.projectId)) };
  };

  const scopedStats =
    <R extends StatsReport | CodeReport | QualityReport | SignalsReport | EffectReport>(
      name: string,
      report: (input: StatsInput, projects: readonly Project[]) => R | Promise<R>,
      sourceKey?: (projects: readonly Project[]) => Promise<string>,
    ) =>
    async (c: Context) => {
      const scope = await statsScopeOf(c);
      if (scope instanceof Response) return scope;
      const moment = now();
      const key = [name, scope.projectId ?? "*", formatLocalDay(moment), sourceKey === undefined ? "" : await sourceKey(scope.projects)].join("|");
      const result = await reports.get(key, async () => {
        const journals = await readJournals(root, scope.projects.map((project) => project.id));
        return report({ tasks: scope.tasks, journals, now: moment, projectId: scope.projectId }, scope.projects);
      });
      return c.json(result);
    };

  const statsOfCode = async (input: StatsInput, projects: readonly Project[]): Promise<CodeReport> => {
    const base = reportBase(input);
    const scoped = projects.filter((project) => input.projectId === undefined || project.id === input.projectId);
    return codeReport({ ...input, code: await codeSource.collect(scoped, codeFixRequests(input, base), input.now) }, base);
  };

  const statsOfEffect = async (input: StatsInput, projects: readonly Project[]): Promise<EffectReport> => {
    const base = reportBase(input);
    const scoped = projects.filter((project) => input.projectId === undefined || project.id === input.projectId);
    const scopedCode = await codeSource.collect(scoped, codeFixRequests(input, base), input.now);
    const allFixes = input.projectId === undefined ? scopedCode : await codeSource.collect(projects, codeFixRequests({ ...input, projectId: undefined }), input.now);
    return effectReport({ ...input, code: { ...scopedCode, fixCommits: allFixes.fixCommits } });
  };

  const repoRootsByCwd = new Map<string, string | null>();
  const repoRootOf = (cwd: string): string | null => {
    if (!repoRootsByCwd.has(cwd)) repoRootsByCwd.set(cwd, repoRootOrNull(cwd));
    return repoRootsByCwd.get(cwd) ?? null;
  };

  const statsOfCost = async (projectId: string | undefined, projects: readonly Project[]): Promise<CostReport> => {
    usage.ensureStarted();
    const { cache, scan } = usage.snapshot();
    const runs = await readRuns(root);
    const projectOf = (cwd: string) => {
      const repoRoot = repoRootOf(cwd);
      return repoRoot === null ? null : (findProjectForRepoRoot(projects, repoRoot, home)?.id ?? null);
    };
    return costReport({ buckets: bucketsOf(cache), runs, projectOf, projectId, now: now(), scan });
  };

  const codeState = (projects: readonly Project[]) => codeSource.stateKey(projects);
  api.get("/stats", scopedStats("stats", (input) => statsReport(input)));
  api.get("/stats/code", scopedStats("code", statsOfCode, codeState));
  api.get("/stats/effect", scopedStats("effect", statsOfEffect, codeState));
  api.get("/stats/quality", scopedStats("quality", (input) => qualityReport(input)));
  api.get("/stats/signals", scopedStats("signals", (input) => ({ signals: statsSignals(input) })));
  api.get("/stats/cost", async (c) => {
    const scope = await statsScopeOf(c);
    return scope instanceof Response ? scope : c.json(await statsOfCost(scope.projectId, scope.projects));
  });
  api.get("/stats/memory", (c) => c.json({ samples: memory.samples() }));

  api.patch("/tasks/:id", async (c) => {
    const body = await readBody(c, updateTaskRequestSchema);
    if (!body.ok) return body.response;

    const id = c.req.param("id");
    const result = await updateTask(root, { id, changes: body.data.changes, expectedVersion: body.data.version, now: now(), via: "web" });
    forgetBacklog();
    if (result.ok) return c.json(result.task);
    if (result.reason === "not-found") return c.json({ errors: [`Задача ${id} не найдена`] }, 404);
    if (result.reason === "conflict") return c.json({ errors: ["Задача изменилась на диске"], current: result.current }, 409);
    return invalidResponse(c, result);
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

function bucketsOf(cache: UsageCache) {
  return Object.values(cache.files).flatMap((entry) => entry.buckets);
}

function invalidResponse(c: Context, result: Invalid) {
  return c.json({ errors: result.errors }, 422);
}

type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: Response };

async function readBody<T>(c: Context, schema: ZodType<T>): Promise<ParsedBody<T>> {
  const body = await readJson(c);
  if (body.ok === false) return { ok: false, response: c.json({ errors: ["Тело запроса не разобрано: ожидается JSON"] }, 400) };
  const parsed = schema.safeParse(body.value);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: c.json({ errors: formatIssues(parsed.error) }, 422) };
}

async function readJson(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

function repoRootOrNull(cwd: string): string | null {
  try {
    return findRepoRoot(cwd);
  } catch {
    return null;
  }
}
