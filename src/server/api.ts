import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { ZodType } from "zod";
import { updateTaskRequestSchema } from "../core/api/contract";
import { createCodeSource } from "../core/code/code-source";
import type { Project } from "../core/model/types";
import { formatIssues } from "../core/model/zod-issues";
import { costReport } from "../core/stats/cost/cost-report";
import { codeFixRequests, codeReport } from "../core/stats/code/code-report";
import { effectReport } from "../core/stats/effect/effect-report";
import { flowReport } from "../core/stats/flow/flow-report";
import { qualityReport } from "../core/stats/quality/quality-report";
import { statsReport } from "../core/stats/report";
import type { StatsInput } from "../core/stats/scope";
import { statsSignals } from "../core/stats/signals/signals";
import type { CodeReport, CostReport, EffectReport, FlowReport, QualityReport, SignalsReport, StatsReport } from "../core/stats/types";
import { loadBacklog } from "../core/store/load";
import { readJournals } from "../core/store/journal";
import { readRuns } from "../core/store/runs";
import { findProjectForRepoRoot, findRepoRoot } from "../core/store/resolve-project";
import { updateTask } from "../core/store/update";
import type { UsageCache } from "../core/usage/usage-cache";
import type { Invalid } from "../core/store/write-result";
import type { ChangeFeed } from "./change-feed";
import type { MemorySampler } from "./memory-sampler";
import type { UsageScanner } from "./usage-scanner";

export type ApiOptions = { root: string; changes: ChangeFeed; now: () => Date; home: string; usage: UsageScanner; memory: MemorySampler };

export function createApi({ root, changes, now, home, usage, memory }: ApiOptions): Hono {
  const api = new Hono();

  api.get("/projects", async (c) => c.json((await loadBacklog(root)).projects));

  api.get("/tasks", async (c) => {
    const { tasks, errors } = await loadBacklog(root);
    return c.json({ tasks, errors });
  });

  const codeSource = createCodeSource({ home });

  const scopedStats =
    <R extends StatsReport | FlowReport | CodeReport | QualityReport | SignalsReport | EffectReport | CostReport>(
      report: (input: StatsInput, projects: readonly Project[]) => R | Promise<R>,
    ) =>
    async (c: Context) => {
      const projectId = c.req.query("project") || undefined;
      const { projects, tasks } = await loadBacklog(root);
      if (projectId !== undefined && !projects.some((project) => project.id === projectId)) {
        return c.json({ errors: [`Проект ${projectId} не найден`] }, 404);
      }
      const journals = await readJournals(root, projects.map((project) => project.id));
      return c.json(await report({ tasks, journals, now: now(), projectId }, projects));
    };

  const statsOfCode = async (input: StatsInput, projects: readonly Project[]): Promise<CodeReport> => {
    const scoped = projects.filter((project) => input.projectId === undefined || project.id === input.projectId);
    return codeReport({ ...input, code: await codeSource.collect(scoped, codeFixRequests(input), input.now) });
  };

  const statsOfEffect = async (input: StatsInput, projects: readonly Project[]): Promise<EffectReport> => {
    const scoped = projects.filter((project) => input.projectId === undefined || project.id === input.projectId);
    const scopedCode = await codeSource.collect(scoped, codeFixRequests(input), input.now);
    const allFixes = input.projectId === undefined ? scopedCode : await codeSource.collect(projects, codeFixRequests({ ...input, projectId: undefined }), input.now);
    return effectReport({ ...input, code: { ...scopedCode, fixCommits: allFixes.fixCommits } });
  };

  const repoRootsByCwd = new Map<string, string | null>();
  const repoRootOf = (cwd: string): string | null => {
    if (!repoRootsByCwd.has(cwd)) repoRootsByCwd.set(cwd, repoRootOrNull(cwd));
    return repoRootsByCwd.get(cwd) ?? null;
  };

  const statsOfCost = async (input: StatsInput, projects: readonly Project[]): Promise<CostReport> => {
    usage.ensureStarted();
    const { cache, scan } = usage.snapshot();
    const runs = await readRuns(root);
    const projectOf = (cwd: string) => {
      const repoRoot = repoRootOf(cwd);
      return repoRoot === null ? null : (findProjectForRepoRoot(projects, repoRoot, home)?.id ?? null);
    };
    return costReport({ buckets: bucketsOf(cache), runs, projectOf, projectId: input.projectId, now: input.now, scan });
  };

  api.get("/stats", scopedStats(statsReport));
  api.get("/stats/flow", scopedStats(flowReport));
  api.get("/stats/code", scopedStats(statsOfCode));
  api.get("/stats/effect", scopedStats(statsOfEffect));
  api.get("/stats/quality", scopedStats(qualityReport));
  api.get("/stats/signals", scopedStats((input) => ({ signals: statsSignals(input) })));
  api.get("/stats/cost", scopedStats(statsOfCost));
  api.get("/stats/memory", (c) => c.json({ samples: memory.samples() }));

  api.patch("/tasks/:id", async (c) => {
    const body = await readBody(c, updateTaskRequestSchema);
    if (!body.ok) return body.response;

    const id = c.req.param("id");
    const result = await updateTask(root, { id, changes: body.data.changes, expectedVersion: body.data.version, now: now(), via: "web" });
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
  const parsed = schema.safeParse(await readJson(c));
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: c.json({ errors: formatIssues(parsed.error) }, 422) };
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function repoRootOrNull(cwd: string): string | null {
  try {
    return findRepoRoot(cwd);
  } catch {
    return null;
  }
}
