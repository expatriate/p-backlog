import { Hono, type Context } from "hono";
import { relative, sep } from "node:path";
import { errorText } from "../core/errors";
import { STATS_MEMORY_ROUTE, STATS_REPORT_ROUTES, type StatsReportKind, type StatsReports } from "../core/api/stats-routes";
import type { GraphHealth } from "../core/check/graph-health";
import { createCodeCacheFile } from "../core/code/code-cache";
import { createCodeSource, type CodeCacheErrorKind } from "../core/code/code-source";
import { formatLocalDay } from "../core/model/dates";
import type { Project, Task } from "../core/model/types";
import { codeReport } from "../core/stats/code/code-report";
import { fixRequests } from "../core/stats/code/fixes";
import { effectReport } from "../core/stats/effect/effect-report";
import { qualityReport } from "../core/stats/quality/quality-report";
import { statsReport } from "../core/stats/report";
import type { ReportContext, StatsInput } from "../core/stats/scope";
import { statsSignals } from "../core/stats/signals/signals";
import type { CodeReport, EffectReport, ProjectGraphRow, QualityReport } from "../core/stats/types";
import { unparsedTasks, type LoadedBacklog, type UnparsedTask } from "../core/store/load";
import type { Language } from "../core/i18n/language";
import { errorResponse } from "./error-response";
import { serverMessages, type LocalizedWarn } from "./messages";
import type { MemorySampler } from "./memory-sampler";
import { createCostSource } from "./cost-source";
import type { JournalSources } from "./journal-sources";
import { createTtlCache } from "./ttl-cache";
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
  journalSources: JournalSources;
};

type BacklogSnapshot = Pick<LoadedBacklog, "projects" | "tasks" | "errors">;

export type GraphHealthOf = (snapshot: BacklogSnapshot, project: Project) => Promise<GraphHealth>;

type StatsApi = { routes: Hono; forgetAll: () => void; forgetChanged: (paths: readonly string[]) => void };

type RequestScope = { projectId: string | undefined; projects: Project[]; tasks: Task[]; unparsedTasks: UnparsedTask[]; snapshot: BacklogSnapshot };

type ReportSources = { context: ReportContext; projects: readonly Project[]; snapshot: BacklogSnapshot; wholeBacklogContext: () => ReportContext };

type ScopedReport<R> = (sources: ReportSources) => R | Promise<R>;

type ScopedReportOptions = { sourceKey?: (projects: readonly Project[], snapshot: BacklogSnapshot) => Promise<string>; wholeBacklog?: boolean };

type ScopedReportKind = Exclude<StatsReportKind, "cost">;

const REPORT_TTL_MS = 5 * 60 * 1000;
const ALL_PROJECTS_TAG = "project:*";
const WHOLE_BACKLOG_TAG = "whole-backlog";
const projectTag = (projectId: string) => `project:${projectId}`;

export function createStatsApi({ root, readLanguage, now, home, services: { usage, memory, warn }, backlog, graphHealth, journalSources }: StatsApiOptions): StatsApi {
  const routes = new Hono();
  const reports = createTtlCache({ ttlMs: REPORT_TTL_MS, now: () => now().getTime() });
  const onCodeSourceError = (kind: CodeCacheErrorKind, error: unknown) =>
    void warn((messages) => (kind === "read" ? messages.codeCacheReadFailed(errorText(error)) : messages.codeCacheWriteFailed(errorText(error))));
  const codeSource = createCodeSource({ home, store: createCodeCacheFile(root), onError: onCodeSourceError });
  const costSource = createCostSource(root, home);
  let knownProjectIds: readonly string[] = [];
  let forgetCount = 0;

  const backlogPruningCaches = async (): Promise<BacklogSnapshot> => {
    const snapshot = await backlog();
    knownProjectIds = snapshot.projects.map((project) => project.id);
    costSource.retain(knownProjectIds);
    codeSource.retain(snapshot.projects);
    return snapshot;
  };

  const requestScopeOf = async (c: Context, snapshot: BacklogSnapshot, { wholeBacklog }: { wholeBacklog: boolean }): Promise<RequestScope | Response> => {
    const projectId = c.req.query("project") || undefined;
    const { projects, tasks, errors } = snapshot;
    if (projectId !== undefined && !projects.some((project) => project.id === projectId)) {
      return errorResponse(c, 404, serverMessages(await readLanguage()).projectNotFound(projectId));
    }
    const scoped = projectsInScope(projects, projectId, { wholeBacklog });
    const scopedIds = new Set(scoped.map((project) => project.id));
    const inScope = (task: { projectId: string }) => scopedIds.has(task.projectId);
    return { projectId, projects: scoped, tasks: tasks.filter(inScope), unparsedTasks: unparsedTasks(errors).filter(inScope), snapshot };
  };

  const serveScoped = <K extends ScopedReportKind>(kind: K, report: ScopedReport<StatsReports[K]>, { sourceKey, wholeBacklog = false }: ScopedReportOptions = {}) =>
    routes.get(STATS_REPORT_ROUTES[kind], async (c) => {
      const forgetCountAtRead = forgetCount;
      const scope = await requestScopeOf(c, await backlogPruningCaches(), { wholeBacklog });
      if (scope instanceof Response) return scope;
      const moment = now();
      const key = [kind, scope.projectId ?? "*", formatLocalDay(moment), sourceKey === undefined ? "" : await sourceKey(scope.projects, scope.snapshot)].join("|");
      const tags = wholeBacklog ? [WHOLE_BACKLOG_TAG] : [scope.projectId === undefined ? ALL_PROJECTS_TAG : projectTag(scope.projectId)];
      const compute = async () => {
        const { journals, contextOf } = await journalSources.read(
          scope.snapshot,
          scope.projects.map((project) => project.id),
        );
        const input: StatsInput = { tasks: scope.tasks, journals, now: moment, projectId: scope.projectId, unparsedTasks: scope.unparsedTasks };
        const wholeBacklogContext = () => contextOf({ ...input, projectId: undefined });
        return report({ context: contextOf(input), projects: scope.projects, snapshot: scope.snapshot, wholeBacklogContext });
      };
      const scopeOutdated = forgetCount !== forgetCountAtRead;
      return c.json(await (scopeOutdated ? compute() : reports.get(key, compute, tags)));
    });

  const statsOfCode: ScopedReport<CodeReport> = async ({ context, projects }) => codeReport(context, await codeSource.collect(projects, context.input.now));

  const statsOfEffect: ScopedReport<EffectReport> = async ({ context, projects, wholeBacklogContext }) => {
    const { projectId, now } = context.input;
    const backlogContext = projectId === undefined ? context : wholeBacklogContext();
    const code = await codeSource.collect(projectsInScope(projects, projectId, { wholeBacklog: false }), now);
    const fixCommits = await codeSource.fixCommits(projects, fixRequests(backlogContext.histories, now), now);
    return effectReport(context, { ...code, fixCommits }, backlogContext);
  };

  const graphRowsOf = (projects: readonly Project[], snapshot: BacklogSnapshot) =>
    Promise.all(projects.map(async (project): Promise<ProjectGraphRow> => ({ projectId: project.id, name: project.name, ...(await graphHealth(snapshot, project)) })));

  const statsOfQuality: ScopedReport<QualityReport> = async ({ context, projects, snapshot }) => qualityReport(context, await graphRowsOf(projects, snapshot));

  const codeState = { sourceKey: (projects: readonly Project[]) => codeSource.stateKey(projects) };
  const graphState = { sourceKey: async (projects: readonly Project[], snapshot: BacklogSnapshot) => JSON.stringify(await graphRowsOf(projects, snapshot)) };
  serveScoped("overview", ({ context }) => statsReport(context));
  serveScoped("code", statsOfCode, codeState);
  serveScoped("effect", statsOfEffect, { ...codeState, wholeBacklog: true });
  serveScoped("quality", statsOfQuality, graphState);
  serveScoped("signals", ({ context }) => ({ signals: statsSignals(context) }));
  routes.get(STATS_REPORT_ROUTES.cost, async (c) => {
    const scope = await requestScopeOf(c, await backlogPruningCaches(), { wholeBacklog: true });
    if (scope instanceof Response) return scope;
    usage.scanIfNeverListed();
    const { snapshot, projects, projectId } = scope;
    return c.json(await costSource.costReport({ usage: usage.snapshot(), scope: { snapshot, projects, projectId }, now: now() }));
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
