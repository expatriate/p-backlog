import { Hono, type Context } from "hono";
import { relative, sep } from "node:path";
import { errorText } from "../core/errors";
import { STATS_MEMORY_ROUTE, STATS_REPORT_ROUTES, type StatsReportKind, type StatsReports } from "../core/api/stats-routes";
import type { GraphHealth } from "../core/check/graph-health";
import { createCodeCacheFile, type CodeCacheErrorKind } from "../core/code/code-cache";
import { createCodeSource } from "../core/code/code-source";
import { formatLocalDay, MINUTE_MS } from "../core/model/dates";
import { projectsInScope } from "../core/model/project-scope";
import type { Project, Task } from "../core/model/types";
import { codeReport } from "../core/stats/code/code-report";
import { fixRequests } from "../core/stats/code/fixes";
import { effectReport } from "../core/stats/effect/effect-report";
import { qualityReport } from "../core/stats/quality/quality-report";
import { statsReport } from "../core/stats/report";
import type { ReportContext } from "../core/stats/scope";
import { statsSignals } from "../core/stats/signals/signals";
import type { CodeReport, CostReport, EffectReport, ProjectGraphRow, QualityReport } from "../core/stats/types";
import { unparsedTasks, type LoadedBacklog, type UnparsedTask } from "../core/store/load";
import type { Language } from "../core/i18n/language";
import { errorResponse, type Refused } from "./error-response";
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

type StatsApi = { routes: Hono; forgetAll: () => void; forgetChanged: (paths: readonly string[]) => void; retain: (projects: readonly Project[]) => void };

type RequestScope = { ok: true; projectId: string | undefined; projects: Project[]; tasks: Task[]; unparsedTasks: UnparsedTask[]; snapshot: BacklogSnapshot };

type ReportSources = {
  projectId: string | undefined;
  at: Date;
  projects: readonly Project[];
  snapshot: BacklogSnapshot;
  context: () => Promise<ReportContext>;
  wholeBacklogContext: () => Promise<ReportContext>;
};

type ScopedReport<R> = (sources: ReportSources) => R | Promise<R>;

type ScopedReportOptions = { sourceKey?: (projects: readonly Project[], snapshot: BacklogSnapshot) => Promise<string>; wholeBacklog?: boolean };

const REPORT_TTL_MS = 5 * MINUTE_MS;
const ALL_PROJECTS_TAG = "all-projects";
const WHOLE_BACKLOG_TAG = "whole-backlog";
const projectTag = (projectId: string) => `project:${projectId}`;

export function createStatsApi({ root, readLanguage, now, home, services: { usage, memory, warn }, backlog, graphHealth, journalSources }: StatsApiOptions): StatsApi {
  const routes = new Hono();
  const reports = createForgettingReportCache(root, now);
  const onCodeSourceError = (kind: CodeCacheErrorKind, error: unknown) =>
    void warn((messages) => (kind === "read" ? messages.codeCacheReadFailed(errorText(error)) : messages.codeCacheWriteFailed(errorText(error))));
  const codeSource = createCodeSource({ home, store: createCodeCacheFile(root), onError: onCodeSourceError });
  const costSource = createCostSource(root, home);

  const serveScoped = <K extends StatsReportKind>(kind: K, report: ScopedReport<StatsReports[K]>, { sourceKey, wholeBacklog = false }: ScopedReportOptions = {}) =>
    routes.get(STATS_REPORT_ROUTES[kind], async (c) => {
      const cachedUnlessForgotten = reports.startRead();
      const scope = await requestScopeOf(c, await backlog(), { wholeBacklog, readLanguage });
      if (!scope.ok) return scope.response;
      const moment = now();
      const key = JSON.stringify([kind, scope.projectId ?? null, formatLocalDay(moment), sourceKey === undefined ? null : await sourceKey(scope.projects, scope.snapshot)]);
      const tags = wholeBacklog ? [WHOLE_BACKLOG_TAG] : [scope.projectId === undefined ? ALL_PROJECTS_TAG : projectTag(scope.projectId)];
      const compute = async () => report(reportSources(scope, moment, journalSources));
      return c.json(await cachedUnlessForgotten(key, compute, tags));
    });

  const statsOfCode: ScopedReport<CodeReport> = async ({ context, projects, at }) => codeReport(await context(), await codeSource.collect(projects, at));

  const statsOfEffect: ScopedReport<EffectReport> = async ({ context, projectId, at, projects, wholeBacklogContext }) => {
    const scopedContext = await context();
    const backlogContext = projectId === undefined ? scopedContext : await wholeBacklogContext();
    const code = await codeSource.collect(projectsInScope(projects, projectId), at);
    const fixCommits = await codeSource.fixCommits(projects, fixRequests(backlogContext.histories, at), at);
    return effectReport(scopedContext, { ...code, fixCommits }, backlogContext);
  };

  const statsOfQuality: ScopedReport<QualityReport> = async ({ context, projects, snapshot }) => qualityReport(await context(), await graphRowsOf(graphHealth, projects, snapshot));

  const statsOfCost: ScopedReport<CostReport> = ({ projectId, at, projects }) => {
    usage.scanIfNeverListed();
    return costSource.costReport({ usage: usage.snapshot(), projects, projectId, now: at });
  };

  const codeState = { sourceKey: (projects: readonly Project[]) => codeSource.stateKey(projects) };
  const graphState = { sourceKey: async (projects: readonly Project[], snapshot: BacklogSnapshot) => JSON.stringify(await graphRowsOf(graphHealth, projects, snapshot)) };
  const usageState = { sourceKey: () => costSource.stateKey(usage.snapshot()) };
  serveScoped("overview", async ({ context }) => statsReport(await context()));
  serveScoped("code", statsOfCode, codeState);
  serveScoped("effect", statsOfEffect, { ...codeState, wholeBacklog: true });
  serveScoped("quality", statsOfQuality, graphState);
  serveScoped("signals", async ({ context }) => ({ signals: statsSignals(await context()) }));
  serveScoped("cost", statsOfCost, { ...usageState, wholeBacklog: true });
  routes.get(STATS_MEMORY_ROUTE, (c) => c.json({ samples: memory.samples() }));

  const retain = (projects: readonly Project[]) => {
    reports.knowProjects(projects.map((project) => project.id));
    codeSource.retain(projects);
  };

  return { routes, forgetAll: reports.forgetAll, forgetChanged: reports.forgetChanged, retain };
}

function createForgettingReportCache(root: string, now: () => Date) {
  const reports = createTtlCache({ ttlMs: REPORT_TTL_MS, now: () => now().getTime() });
  let knownProjectIds: readonly string[] = [];
  let forgetCount = 0;

  const projectIdOfPath = (path: string): string | undefined => {
    const [first] = relative(root, path).split(sep);
    return knownProjectIds.find((id) => id === first);
  };

  const forgetAll = () => {
    forgetCount += 1;
    reports.forgetAll();
  };

  const forgetChanged = (paths: readonly string[]) => {
    const changedProjectIds = paths.map(projectIdOfPath);
    if (!changedProjectIds.every((projectId) => projectId !== undefined)) return forgetAll();
    forgetCount += 1;
    reports.forgetTagged([ALL_PROJECTS_TAG, WHOLE_BACKLOG_TAG, ...changedProjectIds.map(projectTag)]);
  };

  const startRead = () => {
    const forgetCountAtRead = forgetCount;
    return <R>(key: string, compute: () => Promise<R>, tags: readonly string[]): Promise<R> => (forgetCount === forgetCountAtRead ? reports.get(key, compute, tags) : compute());
  };

  const knowProjects = (projectIds: readonly string[]) => {
    knownProjectIds = projectIds;
  };

  return { startRead, knowProjects, forgetAll, forgetChanged };
}

function reportSources(scope: RequestScope, now: Date, journalSources: JournalSources): ReportSources {
  const { projectId, projects, snapshot, tasks } = scope;
  let sources: ReturnType<JournalSources["read"]> | undefined;
  const contextFor = async (contextProjectId: string | undefined): Promise<ReportContext> => {
    const { journals, contextOf } = await (sources ??= journalSources.read(
      snapshot,
      projects.map((project) => project.id),
    ));
    return contextOf({ tasks, journals, now, projectId: contextProjectId, unparsedTasks: scope.unparsedTasks });
  };
  return { projectId, at: now, projects, snapshot, context: () => contextFor(projectId), wholeBacklogContext: () => contextFor(undefined) };
}

type RequestScopeOptions = { wholeBacklog: boolean; readLanguage: () => Promise<Language> };

async function requestScopeOf(c: Context, snapshot: BacklogSnapshot, { wholeBacklog, readLanguage }: RequestScopeOptions): Promise<RequestScope | Refused> {
  const projectId = c.req.query("project") || undefined;
  const { projects, tasks, errors } = snapshot;
  if (projectId !== undefined && !projects.some((project) => project.id === projectId)) {
    return { ok: false, response: errorResponse(c, 404, serverMessages(await readLanguage()).projectNotFound(projectId)) };
  }
  const scoped = projectsInScope(projects, projectId, { wholeBacklog });
  const scopedIds = new Set(scoped.map((project) => project.id));
  const inScope = (task: { projectId: string }) => scopedIds.has(task.projectId);
  return { ok: true, projectId, projects: scoped, tasks: tasks.filter(inScope), unparsedTasks: unparsedTasks(errors).filter(inScope), snapshot };
}

function graphRowsOf(graphHealth: GraphHealthOf, projects: readonly Project[], snapshot: BacklogSnapshot): Promise<ProjectGraphRow[]> {
  return Promise.all(projects.map(async (project): Promise<ProjectGraphRow> => ({ projectId: project.id, name: project.name, ...(await graphHealth(snapshot, project)) })));
}
