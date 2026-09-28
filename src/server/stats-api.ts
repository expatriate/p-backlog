import { Hono, type Context } from "hono";
import { relative, sep } from "node:path";
import { errorText } from "../core/errors";
import { STATS_MEMORY_ROUTE, STATS_REPORT_ROUTES } from "../core/api/stats-routes";
import type { GraphHealth } from "../core/check/graph-health";
import { createCodeCacheFile } from "../core/code/code-cache";
import { createCodeSource, type CodeCacheErrorKind } from "../core/code/code-source";
import { formatLocalDay } from "../core/model/dates";
import type { Project, Task } from "../core/model/types";
import { codeReport } from "../core/stats/code/code-report";
import { fixRequests } from "../core/stats/code/fixes";
import { costReport } from "../core/stats/cost/cost-report";
import { effectReport } from "../core/stats/effect/effect-report";
import { qualityReport } from "../core/stats/quality/quality-report";
import { statsReport } from "../core/stats/report";
import type { ReportBase, StatsInput } from "../core/stats/scope";
import { statsSignals } from "../core/stats/signals/signals";
import type { CodeReport, CostReport, EffectReport, ProjectGraphRow, QualityReport, SignalsReport, StatsReport } from "../core/stats/types";
import { unparsedTasks, type LoadedBacklog, type UnparsedTask } from "../core/store/load";
import { cachedRepoRoots, findProjectForRoots, type GitRoots, type RepoRootLookup } from "../core/store/resolve-project";
import type { UsageCache } from "../core/usage/usage-cache";
import type { Language } from "../core/i18n/language";
import { serverMessages, type LocalizedWarn } from "./messages";
import type { MemorySampler } from "./memory-sampler";
import { createCostSource, type CostInputs } from "./cost-source";
import { createJournalSources } from "./journal-sources";
import { createReportCache } from "./report-cache";
import type { UsageScanner } from "./usage-scanner";

export type StatsServices = { usage: UsageScanner; memory: MemorySampler; warn: LocalizedWarn };

type StatsApiOptions = {
  root: string;
  readLanguage: () => Promise<Language>;
  now: () => Date;
  home: string;
  services: StatsServices;
  backlog: () => Promise<BacklogSnapshot>;
  graphHealth: GraphHealthOf;
};

type BacklogSnapshot = Pick<LoadedBacklog, "projects" | "tasks" | "errors">;

export type GraphHealthOf = (snapshot: BacklogSnapshot, project: Project) => Promise<GraphHealth>;

type StatsApi = { routes: Hono; forgetAll: () => void; forgetChanged: (paths: readonly string[]) => void };

type StatsScope = { projectId: string | undefined; projects: Project[]; tasks: Task[]; unparsedTasks: UnparsedTask[]; snapshot: BacklogSnapshot };

type ReportSources = { input: StatsInput; base: ReportBase; projects: readonly Project[]; snapshot: BacklogSnapshot; wholeBacklogBase: () => ReportBase };

type ScopedReport<R> = (sources: ReportSources) => R | Promise<R>;

type ScopedReportOptions = { sourceKey?: (projects: readonly Project[], snapshot: BacklogSnapshot) => Promise<string>; wholeBacklog?: boolean };

const REPORT_TTL_MS = 5 * 60 * 1000;
const ALL_PROJECTS_TAG = "project:*";
const WHOLE_BACKLOG_TAG = "whole-backlog";
const projectTag = (projectId: string) => `project:${projectId}`;

export function createStatsApi({ root, readLanguage, now, home, services: { usage, memory, warn }, backlog, graphHealth }: StatsApiOptions): StatsApi {
  const routes = new Hono();
  const reports = createReportCache({ ttlMs: REPORT_TTL_MS, now: () => now().getTime() });
  const onCodeSourceError = (kind: CodeCacheErrorKind, error: unknown) =>
    void warn((messages) => (kind === "read" ? messages.codeCacheReadFailed(errorText(error)) : messages.codeCacheWriteFailed(errorText(error))));
  const codeSource = createCodeSource({ home, store: createCodeCacheFile(root), onError: onCodeSourceError });
  const lookupRepoRoot = cachedRepoRoots();
  const journalSources = createJournalSources(root);
  const costSource = createCostSource(root, (inputs) => costOf(inputs, home, lookupRepoRoot));
  let knownProjectIds: readonly string[] = [];
  let forgetCount = 0;

  const backlogPruningCaches = async (): Promise<BacklogSnapshot> => {
    const snapshot = await backlog();
    knownProjectIds = snapshot.projects.map((project) => project.id);
    journalSources.retain(knownProjectIds);
    costSource.retain(knownProjectIds);
    codeSource.retain(snapshot.projects);
    return snapshot;
  };

  const statsScopeOf = async (c: Context, snapshot: BacklogSnapshot, { wholeBacklog }: { wholeBacklog: boolean }): Promise<StatsScope | Response> => {
    const projectId = c.req.query("project") || undefined;
    const { projects, tasks, errors } = snapshot;
    if (projectId !== undefined && !projects.some((project) => project.id === projectId)) {
      return c.json({ errors: [serverMessages(await readLanguage()).projectNotFound(projectId)] }, 404);
    }
    const scoped = projectsInScope(projects, projectId, { wholeBacklog });
    const scopedIds = new Set(scoped.map((project) => project.id));
    const inScope = (task: { projectId: string }) => scopedIds.has(task.projectId);
    return { projectId, projects: scoped, tasks: tasks.filter(inScope), unparsedTasks: unparsedTasks(errors).filter(inScope), snapshot };
  };

  const scopedStats =
    <R extends StatsReport | CodeReport | QualityReport | SignalsReport | EffectReport>(name: string, report: ScopedReport<R>, { sourceKey, wholeBacklog = false }: ScopedReportOptions = {}) =>
    async (c: Context) => {
      const forgetCountAtRead = forgetCount;
      const scope = await statsScopeOf(c, await backlogPruningCaches(), { wholeBacklog });
      if (scope instanceof Response) return scope;
      const moment = now();
      const key = [name, scope.projectId ?? "*", formatLocalDay(moment), sourceKey === undefined ? "" : await sourceKey(scope.projects, scope.snapshot)].join("|");
      const tags = wholeBacklog ? [WHOLE_BACKLOG_TAG] : [scope.projectId === undefined ? ALL_PROJECTS_TAG : projectTag(scope.projectId)];
      const compute = async () => {
        const { journals, baseOf } = await journalSources.read(scope.snapshot, scope.projects.map((project) => project.id));
        const input: StatsInput = { tasks: scope.tasks, journals, now: moment, projectId: scope.projectId, unparsedTasks: scope.unparsedTasks };
        const wholeBacklogBase = () => baseOf("backlog", { ...input, projectId: undefined });
        return report({ input, base: baseOf("scoped", input), projects: scope.projects, snapshot: scope.snapshot, wholeBacklogBase });
      };
      const scopeOutdated = forgetCount !== forgetCountAtRead;
      return c.json(await (scopeOutdated ? compute() : reports.get(key, compute, tags)));
    };

  const statsOfCode: ScopedReport<CodeReport> = async ({ input, base, projects }) => codeReport({ ...input, code: await codeSource.collect(projects, input.now) }, base);

  const statsOfEffect: ScopedReport<EffectReport> = async ({ input, base, projects, wholeBacklogBase }) => {
    const backlogBase = input.projectId === undefined ? base : wholeBacklogBase();
    const scoped = projects.filter((project) => input.projectId === undefined || project.id === input.projectId);
    const code = await codeSource.collect(scoped, input.now);
    const fixCommits = await codeSource.fixCommits(projects, fixRequests(backlogBase.histories, input.now), input.now);
    return effectReport({ ...input, code: { ...code, fixCommits } }, base, backlogBase);
  };

  const graphRowsOf = (projects: readonly Project[], snapshot: BacklogSnapshot) =>
    Promise.all(projects.map(async (project): Promise<ProjectGraphRow> => ({ projectId: project.id, name: project.name, ...(await graphHealth(snapshot, project)) })));

  const statsOfQuality: ScopedReport<QualityReport> = async ({ input, base, projects, snapshot }) => qualityReport(input, base, await graphRowsOf(projects, snapshot));

  const codeState = { sourceKey: (projects: readonly Project[]) => codeSource.stateKey(projects) };
  const graphState = { sourceKey: async (projects: readonly Project[], snapshot: BacklogSnapshot) => JSON.stringify(await graphRowsOf(projects, snapshot)) };
  routes.get(STATS_REPORT_ROUTES.overview, scopedStats("stats", ({ input, base }) => statsReport(input, base)));
  routes.get(STATS_REPORT_ROUTES.code, scopedStats("code", statsOfCode, codeState));
  routes.get(STATS_REPORT_ROUTES.effect, scopedStats("effect", statsOfEffect, { ...codeState, wholeBacklog: true }));
  routes.get(STATS_REPORT_ROUTES.quality, scopedStats("quality", statsOfQuality, graphState));
  routes.get(STATS_REPORT_ROUTES.signals, scopedStats("signals", ({ input, base }) => ({ signals: statsSignals(input, base) })));
  routes.get(STATS_REPORT_ROUTES.cost, async (c) => {
    const scope = await statsScopeOf(c, await backlogPruningCaches(), { wholeBacklog: true });
    if (scope instanceof Response) return scope;
    usage.scanIfNeverListed();
    const { snapshot, projectId } = scope;
    return c.json(await costSource.costReport({ usage: usage.snapshot(), scope: { snapshot, projectId }, now: now() }));
  });
  routes.get(STATS_MEMORY_ROUTE, (c) => c.json({ samples: memory.samples() }));

  const projectIdOfPath = (path: string): string | undefined => {
    const [first] = relative(root, path).split(sep);
    return knownProjectIds.find((id) => id === first);
  };

  const forgetAll = () => {
    forgetCount += 1;
    reports.clear();
  };

  const forgetChanged = (paths: readonly string[]) => {
    const changedProjectIds = paths.map(projectIdOfPath);
    if (!changedProjectIds.every((projectId) => projectId !== undefined)) return forgetAll();
    forgetCount += 1;
    reports.clearTagged([ALL_PROJECTS_TAG, WHOLE_BACKLOG_TAG, ...changedProjectIds.map(projectTag)]);
  };

  return { routes, forgetAll, forgetChanged };
}

function projectsInScope(projects: readonly Project[], projectId: string | undefined, { wholeBacklog }: { wholeBacklog: boolean }): Project[] {
  return projects.filter((project) => project.id === projectId || ((projectId === undefined || wholeBacklog) && project.active));
}

async function costOf({ usage: { cache, scan }, runs, scope: { snapshot, projectId }, now }: CostInputs, home: string, lookupRepoRoot: RepoRootLookup): Promise<CostReport> {
  const projects = projectsInScope(snapshot.projects, projectId, { wholeBacklog: true });
  const buckets = bucketsOf(cache);
  const repoRoots = projectId === undefined ? new Map<string, GitRoots | null>() : await resolveRepoRoots(lookupRepoRoot, [...buckets, ...runs].map((entry) => entry.cwd));
  const projectOf = (cwd: string) => {
    const roots = repoRoots.get(cwd) ?? null;
    return roots === null ? null : (findProjectForRoots(projects, roots, home)?.id ?? null);
  };
  return costReport({ buckets, runs, projectOf, projectId, now, scan });
}

function bucketsOf(cache: UsageCache) {
  return Object.values(cache.files).flatMap((entry) => entry.buckets);
}

async function resolveRepoRoots(lookupRepoRoot: RepoRootLookup, cwds: readonly string[]): Promise<Map<string, GitRoots | null>> {
  const unique = [...new Set(cwds)];
  return new Map(await Promise.all(unique.map(async (cwd) => [cwd, await lookupRepoRoot(cwd)] as const)));
}
