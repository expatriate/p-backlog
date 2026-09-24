import { Hono, type Context } from "hono";
import { errorText } from "../core/errors";
import { projectGraphHealth } from "../core/check/graph-health";
import { createCodeCacheFile } from "../core/code/code-cache";
import { createCodeSource, type CodeCacheErrorKind } from "../core/code/code-source";
import { formatLocalDay } from "../core/model/dates";
import type { Project, Task } from "../core/model/types";
import { codeFixRequests, codeReport } from "../core/stats/code/code-report";
import { costReport } from "../core/stats/cost/cost-report";
import { effectReport } from "../core/stats/effect/effect-report";
import { qualityReport } from "../core/stats/quality/quality-report";
import { statsReport } from "../core/stats/report";
import { reportBase, type ReportBase, type StatsInput } from "../core/stats/scope";
import { statsSignals } from "../core/stats/signals/signals";
import type { CodeReport, CostReport, EffectReport, ProjectGraphRow, QualityReport, SignalsReport, StatsReport } from "../core/stats/types";
import { readJournals } from "../core/store/journal";
import { unparsedTasks, type LoadedBacklog, type UnparsedTask } from "../core/store/load";
import { cachedRepoRoots, findProjectForRepoRoot, type RepoRootLookup } from "../core/store/resolve-project";
import { readRuns } from "../core/store/runs";
import type { UsageCache } from "../core/usage/usage-cache";
import { serverLanguage, serverMessages } from "./messages";
import type { MemorySampler } from "./memory-sampler";
import { createReportCache } from "./report-cache";
import type { UsageScanner } from "./usage-scanner";

type StatsApiOptions = {
  root: string;
  now: () => Date;
  home: string;
  usage: UsageScanner;
  memory: MemorySampler;
  backlog: () => Promise<Pick<LoadedBacklog, "projects" | "tasks" | "errors">>;
};

type StatsApi = { routes: Hono; forget: () => void };

type StatsScope = { projectId: string | undefined; projects: Project[]; tasks: Task[]; unparsedTasks: UnparsedTask[] };

type ScopedReport<R> = (input: StatsInput, base: ReportBase, projects: readonly Project[]) => R | Promise<R>;

type ScopedReportOptions = { sourceKey?: (projects: readonly Project[]) => Promise<string>; wholeBacklog?: boolean };

const REPORT_TTL_MS = 5 * 60 * 1000;

export function createStatsApi({ root, now, home, usage, memory, backlog }: StatsApiOptions): StatsApi {
  const routes = new Hono();
  const reports = createReportCache({ ttlMs: REPORT_TTL_MS, now: () => now().getTime() });
  const onCodeSourceError = (kind: CodeCacheErrorKind, error: unknown) =>
    void serverLanguage(root).then((language) => {
      const messages = serverMessages(language);
      const text = kind === "read" ? messages.codeCacheReadFailed(errorText(error)) : messages.codeCacheWriteFailed(errorText(error));
      process.stderr.write(`${text}\n`);
    });
  const codeSource = createCodeSource({ home, store: createCodeCacheFile(root), onError: onCodeSourceError });
  const lookupRepoRoot = cachedRepoRoots();

  const statsScopeOf = async (c: Context, { wholeBacklog }: { wholeBacklog: boolean }): Promise<StatsScope | Response> => {
    const projectId = c.req.query("project") || undefined;
    const { projects, tasks, errors } = await backlog();
    if (projectId !== undefined && !projects.some((project) => project.id === projectId)) {
      return c.json({ errors: [serverMessages(await serverLanguage(root)).projectNotFound(projectId)] }, 404);
    }
    const included = (project: Project) => project.id === projectId || ((projectId === undefined || wholeBacklog) && project.active);
    const scoped = projects.filter(included);
    const scopedIds = new Set(scoped.map((project) => project.id));
    const inScope = (task: { projectId: string }) => scopedIds.has(task.projectId);
    return { projectId, projects: scoped, tasks: tasks.filter(inScope), unparsedTasks: unparsedTasks(errors).filter(inScope) };
  };

  const scopedStats =
    <R extends StatsReport | CodeReport | QualityReport | SignalsReport | EffectReport>(name: string, report: ScopedReport<R>, { sourceKey, wholeBacklog = false }: ScopedReportOptions = {}) =>
    async (c: Context) => {
      const scope = await statsScopeOf(c, { wholeBacklog });
      if (scope instanceof Response) return scope;
      const moment = now();
      const key = [name, scope.projectId ?? "*", formatLocalDay(moment), sourceKey === undefined ? "" : await sourceKey(scope.projects)].join("|");
      const result = await reports.get(key, async () => {
        const journals = await readJournals(root, scope.projects.map((project) => project.id));
        const input: StatsInput = { tasks: scope.tasks, journals, now: moment, projectId: scope.projectId, unparsedTasks: scope.unparsedTasks };
        return report(input, reportBase(input), scope.projects);
      });
      return c.json(result);
    };

  const statsOfCode: ScopedReport<CodeReport> = async (input, base, projects) => codeReport({ ...input, code: await codeSource.collect(projects, input.now) }, base);

  const statsOfEffect: ScopedReport<EffectReport> = async (input, base, projects) => {
    const backlogBase = input.projectId === undefined ? base : reportBase({ ...input, projectId: undefined });
    const scoped = projects.filter((project) => input.projectId === undefined || project.id === input.projectId);
    const code = await codeSource.collect(scoped, input.now);
    const fixCommits = await codeSource.fixCommits(projects, codeFixRequests({ ...input, projectId: undefined }, backlogBase), input.now);
    return effectReport({ ...input, code: { ...code, fixCommits } }, base, backlogBase);
  };

  const statsOfQuality: ScopedReport<QualityReport> = async (input, base, projects) => qualityReport(input, base, await projectGraphs(projects, input.tasks, home));

  const statsOfCost = async (projectId: string | undefined, projects: readonly Project[]): Promise<CostReport> => {
    usage.ensureStarted();
    const { cache, scan } = usage.snapshot();
    const buckets = bucketsOf(cache);
    const runs = await readRuns(root);
    const repoRoots = projectId === undefined ? new Map<string, string | null>() : await resolveRepoRoots(lookupRepoRoot, [...buckets, ...runs].map((entry) => entry.cwd));
    const projectOf = (cwd: string) => {
      const repoRoot = repoRoots.get(cwd) ?? null;
      return repoRoot === null ? null : (findProjectForRepoRoot(projects, repoRoot, home)?.id ?? null);
    };
    return costReport({ buckets, runs, projectOf, projectId, now: now(), scan });
  };

  const codeState = { sourceKey: (projects: readonly Project[]) => codeSource.stateKey(projects) };
  routes.get("/stats", scopedStats("stats", (input, base) => statsReport(input, base)));
  routes.get("/stats/code", scopedStats("code", statsOfCode, codeState));
  routes.get("/stats/effect", scopedStats("effect", statsOfEffect, { ...codeState, wholeBacklog: true }));
  routes.get("/stats/quality", scopedStats("quality", statsOfQuality));
  routes.get("/stats/signals", scopedStats("signals", (input, base) => ({ signals: statsSignals(input, base) })));
  routes.get("/stats/cost", async (c) => {
    const scope = await statsScopeOf(c, { wholeBacklog: true });
    return scope instanceof Response ? scope : c.json(await statsOfCost(scope.projectId, scope.projects));
  });
  routes.get("/stats/memory", (c) => c.json({ samples: memory.samples() }));

  return { routes, forget: () => reports.clear() };
}

async function projectGraphs(projects: readonly Project[], tasks: readonly Task[], home: string): Promise<ProjectGraphRow[]> {
  return Promise.all(
    projects.map(async (project) => ({ projectId: project.id, name: project.name, ...(await projectGraphHealth(project, tasks, home)) })),
  );
}

function bucketsOf(cache: UsageCache) {
  return Object.values(cache.files).flatMap((entry) => entry.buckets);
}

async function resolveRepoRoots(lookupRepoRoot: RepoRootLookup, cwds: readonly string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(cwds)];
  return new Map(await Promise.all(unique.map(async (cwd) => [cwd, await lookupRepoRoot(cwd)] as const)));
}
