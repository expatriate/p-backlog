import { Hono, type Context } from "hono";
import { relative, sep } from "node:path";
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
import type { ReportBase, StatsInput } from "../core/stats/scope";
import { statsSignals } from "../core/stats/signals/signals";
import type { CodeReport, CostReport, EffectReport, ProjectGraphRow, QualityReport, SignalsReport, StatsReport } from "../core/stats/types";
import { unparsedTasks, type LoadedBacklog, type UnparsedTask } from "../core/store/load";
import { cachedRepoRoots, findProjectForRoots, type GitRoots, type RepoRootLookup } from "../core/store/resolve-project";
import type { UsageCache } from "../core/usage/usage-cache";
import type { Language } from "../core/i18n/language";
import { serverMessages } from "./messages";
import type { MemorySampler } from "./memory-sampler";
import { createReportCache } from "./report-cache";
import { createStatsSources, type CostInputs } from "./stats-sources";
import type { UsageScanner } from "./usage-scanner";

type StatsApiOptions = {
  root: string;
  readLanguage: () => Promise<Language>;
  now: () => Date;
  home: string;
  usage: UsageScanner;
  memory: MemorySampler;
  warn: (line: string) => void;
  backlog: () => Promise<Pick<LoadedBacklog, "projects" | "tasks" | "errors">>;
};

type StatsApi = { routes: Hono; forget: (paths?: readonly string[]) => void };

type StatsScope = { projectId: string | undefined; projects: Project[]; tasks: Task[]; unparsedTasks: UnparsedTask[]; snapshot: object };

type ReportSources = { input: StatsInput; base: ReportBase; projects: readonly Project[]; wholeBacklogBase: () => ReportBase };

type ScopedReport<R> = (sources: ReportSources) => R | Promise<R>;

type ScopedReportOptions = { sourceKey?: (projects: readonly Project[]) => Promise<string>; wholeBacklog?: boolean };

const REPORT_TTL_MS = 5 * 60 * 1000;
const ALL_PROJECTS_TAG = "project:*";
const WHOLE_BACKLOG_TAG = "whole-backlog";
const projectTag = (projectId: string) => `project:${projectId}`;

export function createStatsApi({ root, readLanguage, now, home, usage, memory, warn, backlog }: StatsApiOptions): StatsApi {
  const routes = new Hono();
  const reports = createReportCache({ ttlMs: REPORT_TTL_MS, now: () => now().getTime() });
  const onCodeSourceError = (kind: CodeCacheErrorKind, error: unknown) =>
    void readLanguage().then((language) => {
      const messages = serverMessages(language);
      const text = kind === "read" ? messages.codeCacheReadFailed(errorText(error)) : messages.codeCacheWriteFailed(errorText(error));
      warn(text);
    });
  const codeSource = createCodeSource({ home, store: createCodeCacheFile(root), onError: onCodeSourceError });
  const lookupRepoRoot = cachedRepoRoots();
  const sources = createStatsSources(root, (inputs) => costOf(inputs, home, lookupRepoRoot));
  let knownProjectIds: readonly string[] = [];

  const statsScopeOf = async (c: Context, { wholeBacklog }: { wholeBacklog: boolean }): Promise<StatsScope | Response> => {
    const projectId = c.req.query("project") || undefined;
    const snapshot = await backlog();
    const { projects, tasks, errors } = snapshot;
    knownProjectIds = projects.map((project) => project.id);
    sources.retain(knownProjectIds);
    if (projectId !== undefined && !projects.some((project) => project.id === projectId)) {
      return c.json({ errors: [serverMessages(await readLanguage()).projectNotFound(projectId)] }, 404);
    }
    const included = (project: Project) => project.id === projectId || ((projectId === undefined || wholeBacklog) && project.active);
    const scoped = projects.filter(included);
    const scopedIds = new Set(scoped.map((project) => project.id));
    const inScope = (task: { projectId: string }) => scopedIds.has(task.projectId);
    return { projectId, projects: scoped, tasks: tasks.filter(inScope), unparsedTasks: unparsedTasks(errors).filter(inScope), snapshot };
  };

  const scopedStats =
    <R extends StatsReport | CodeReport | QualityReport | SignalsReport | EffectReport>(name: string, report: ScopedReport<R>, { sourceKey, wholeBacklog = false }: ScopedReportOptions = {}) =>
    async (c: Context) => {
      const scope = await statsScopeOf(c, { wholeBacklog });
      if (scope instanceof Response) return scope;
      const moment = now();
      const key = [name, scope.projectId ?? "*", formatLocalDay(moment), sourceKey === undefined ? "" : await sourceKey(scope.projects)].join("|");
      const tags = wholeBacklog ? [WHOLE_BACKLOG_TAG] : [scope.projectId === undefined ? ALL_PROJECTS_TAG : projectTag(scope.projectId)];
      const result = await reports.get(
        key,
        async () => {
          const { journals, baseOf } = await sources.read(scope.snapshot, scope.projects.map((project) => project.id));
          const input: StatsInput = { tasks: scope.tasks, journals, now: moment, projectId: scope.projectId, unparsedTasks: scope.unparsedTasks };
          const wholeBacklogBase = () => baseOf("backlog", { ...input, projectId: undefined });
          return report({ input, base: baseOf("scoped", input), projects: scope.projects, wholeBacklogBase });
        },
        tags,
      );
      return c.json(result);
    };

  const statsOfCode: ScopedReport<CodeReport> = async ({ input, base, projects }) => codeReport({ ...input, code: await codeSource.collect(projects, input.now) }, base);

  const statsOfEffect: ScopedReport<EffectReport> = async ({ input, base, projects, wholeBacklogBase }) => {
    const backlogBase = input.projectId === undefined ? base : wholeBacklogBase();
    const scoped = projects.filter((project) => input.projectId === undefined || project.id === input.projectId);
    const code = await codeSource.collect(scoped, input.now);
    const fixCommits = await codeSource.fixCommits(projects, codeFixRequests({ ...input, projectId: undefined }, backlogBase), input.now);
    return effectReport({ ...input, code: { ...code, fixCommits } }, base, backlogBase);
  };

  const statsOfQuality: ScopedReport<QualityReport> = async ({ input, base, projects }) => qualityReport(input, base, await projectGraphs(projects, input.tasks, home));

  const codeState = { sourceKey: (projects: readonly Project[]) => codeSource.stateKey(projects) };
  routes.get("/stats", scopedStats("stats", ({ input, base }) => statsReport(input, base)));
  routes.get("/stats/code", scopedStats("code", statsOfCode, codeState));
  routes.get("/stats/effect", scopedStats("effect", statsOfEffect, { ...codeState, wholeBacklog: true }));
  routes.get("/stats/quality", scopedStats("quality", statsOfQuality));
  routes.get("/stats/signals", scopedStats("signals", ({ input, base }) => ({ signals: statsSignals(input, base) })));
  routes.get("/stats/cost", async (c) => {
    const scope = await statsScopeOf(c, { wholeBacklog: true });
    if (scope instanceof Response) return scope;
    usage.ensureStarted();
    const { snapshot, projectId, projects } = scope;
    return c.json(await sources.costReport({ usage: usage.snapshot(), scope: { snapshot, projectId, projects }, now: now() }));
  });
  routes.get("/stats/memory", (c) => c.json({ samples: memory.samples() }));

  const projectIdOfPath = (path: string): string | undefined => {
    const [first] = relative(root, path).split(sep);
    return knownProjectIds.find((id) => id === first);
  };

  const forget = (paths?: readonly string[]) => {
    if (paths === undefined || paths.length === 0) return void reports.clear();
    const changedProjectIds = new Set<string>();
    for (const path of paths) {
      const projectId = projectIdOfPath(path);
      if (projectId === undefined) return void reports.clear();
      changedProjectIds.add(projectId);
    }
    reports.clearTagged([ALL_PROJECTS_TAG, WHOLE_BACKLOG_TAG, ...[...changedProjectIds].map(projectTag)]);
  };

  return { routes, forget };
}

async function projectGraphs(projects: readonly Project[], tasks: readonly Task[], home: string): Promise<ProjectGraphRow[]> {
  return Promise.all(
    projects.map(async (project) => ({ projectId: project.id, name: project.name, ...(await projectGraphHealth(project, tasks, home)) })),
  );
}

async function costOf({ usage: { cache, scan }, runs, scope: { projectId, projects }, now }: CostInputs, home: string, lookupRepoRoot: RepoRootLookup): Promise<CostReport> {
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
