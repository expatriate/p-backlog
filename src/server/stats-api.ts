import { join } from "node:path";
import { Hono, type Context } from "hono";
import type { Revision } from "../core/api/contract";
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
import { journalEventSchema, type JournalEvent, type ProjectJournal } from "../core/journal/events";
import { JOURNAL_FILE, projectJournal } from "../core/store/journal";
import { createJsonlTail, type JsonlTail } from "../core/store/jsonl-tail";
import { unparsedTasks, type LoadedBacklog, type UnparsedTask } from "../core/store/load";
import { cachedRepoRoots, findProjectForRoots, type GitRoots, type RepoRootLookup } from "../core/store/resolve-project";
import { readRuns } from "../core/store/runs";
import type { UsageCache } from "../core/usage/usage-cache";
import type { Language } from "../core/i18n/language";
import { serverMessages } from "./messages";
import type { MemorySampler } from "./memory-sampler";
import { createReportCache } from "./report-cache";
import type { UsageScanner } from "./usage-scanner";

type StatsApiOptions = {
  root: string;
  readLanguage: () => Promise<Language>;
  now: () => Date;
  home: string;
  usage: UsageScanner;
  memory: MemorySampler;
  warn: (line: string) => void;
  backlog: () => Promise<Pick<LoadedBacklog, "projects" | "tasks" | "errors"> & { revision: Revision }>;
};

type StatsApi = { routes: Hono; forget: () => void };

type StatsScope = { projectId: string | undefined; projects: Project[]; tasks: Task[]; unparsedTasks: UnparsedTask[]; revision: Revision };

type ReportSources = { input: StatsInput; base: ReportBase; projects: readonly Project[]; wholeBacklogBase: () => ReportBase };

type ScopedReport<R> = (sources: ReportSources) => R | Promise<R>;

type JournalLengths = ReadonlyMap<string, number>;

type TailedJournals = { journals: ProjectJournal[]; lengths: JournalLengths };

type BaseVersion = { revision: Revision; lengths: JournalLengths };

type BaseSlot = "scoped" | "backlog";

type MemoizedBase = (slot: BaseSlot, input: StatsInput, version: BaseVersion) => ReportBase;

type ScopedReportOptions = { sourceKey?: (projects: readonly Project[]) => Promise<string>; wholeBacklog?: boolean };

const REPORT_TTL_MS = 5 * 60 * 1000;

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
  const readJournalsTailed = createJournalTails(root);
  const memoizedBase = createBaseMemo();

  const statsScopeOf = async (c: Context, { wholeBacklog }: { wholeBacklog: boolean }): Promise<StatsScope | Response> => {
    const projectId = c.req.query("project") || undefined;
    const { projects, tasks, errors, revision } = await backlog();
    if (projectId !== undefined && !projects.some((project) => project.id === projectId)) {
      return c.json({ errors: [serverMessages(await readLanguage()).projectNotFound(projectId)] }, 404);
    }
    const included = (project: Project) => project.id === projectId || ((projectId === undefined || wholeBacklog) && project.active);
    const scoped = projects.filter(included);
    const scopedIds = new Set(scoped.map((project) => project.id));
    const inScope = (task: { projectId: string }) => scopedIds.has(task.projectId);
    return { projectId, projects: scoped, tasks: tasks.filter(inScope), unparsedTasks: unparsedTasks(errors).filter(inScope), revision };
  };

  const scopedStats =
    <R extends StatsReport | CodeReport | QualityReport | SignalsReport | EffectReport>(name: string, report: ScopedReport<R>, { sourceKey, wholeBacklog = false }: ScopedReportOptions = {}) =>
    async (c: Context) => {
      const scope = await statsScopeOf(c, { wholeBacklog });
      if (scope instanceof Response) return scope;
      const moment = now();
      const key = [name, scope.projectId ?? "*", formatLocalDay(moment), sourceKey === undefined ? "" : await sourceKey(scope.projects)].join("|");
      const result = await reports.get(key, async () => {
        const { journals, lengths } = await readJournalsTailed(scope.projects.map((project) => project.id));
        const input: StatsInput = { tasks: scope.tasks, journals, now: moment, projectId: scope.projectId, unparsedTasks: scope.unparsedTasks };
        const version: BaseVersion = { revision: scope.revision, lengths };
        const wholeBacklogBase = () => memoizedBase("backlog", { ...input, projectId: undefined }, version);
        return report({ input, base: memoizedBase("scoped", input, version), projects: scope.projects, wholeBacklogBase });
      });
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

  const statsOfCost = async (projectId: string | undefined, projects: readonly Project[]): Promise<CostReport> => {
    usage.ensureStarted();
    const { cache, scan } = usage.snapshot();
    const buckets = bucketsOf(cache);
    const runs = await readRuns(root);
    const repoRoots = projectId === undefined ? new Map<string, GitRoots | null>() : await resolveRepoRoots(lookupRepoRoot, [...buckets, ...runs].map((entry) => entry.cwd));
    const projectOf = (cwd: string) => {
      const roots = repoRoots.get(cwd) ?? null;
      return roots === null ? null : (findProjectForRoots(projects, roots, home)?.id ?? null);
    };
    return costReport({ buckets, runs, projectOf, projectId, now: now(), scan });
  };

  const codeState = { sourceKey: (projects: readonly Project[]) => codeSource.stateKey(projects) };
  routes.get("/stats", scopedStats("stats", ({ input, base }) => statsReport(input, base)));
  routes.get("/stats/code", scopedStats("code", statsOfCode, codeState));
  routes.get("/stats/effect", scopedStats("effect", statsOfEffect, { ...codeState, wholeBacklog: true }));
  routes.get("/stats/quality", scopedStats("quality", statsOfQuality));
  routes.get("/stats/signals", scopedStats("signals", ({ input, base }) => ({ signals: statsSignals(input, base) })));
  routes.get("/stats/cost", async (c) => {
    const scope = await statsScopeOf(c, { wholeBacklog: true });
    return scope instanceof Response ? scope : c.json(await statsOfCost(scope.projectId, scope.projects));
  });
  routes.get("/stats/memory", (c) => c.json({ samples: memory.samples() }));

  return { routes, forget: () => reports.clear() };
}

function createJournalTails(root: string): (projectIds: readonly string[]) => Promise<TailedJournals> {
  const tails = new Map<string, JsonlTail<JournalEvent>>();
  const tailOf = (projectId: string) => {
    const known = tails.get(projectId);
    if (known !== undefined) return known;
    const created = createJsonlTail(join(root, projectId, JOURNAL_FILE), journalEventSchema);
    tails.set(projectId, created);
    return created;
  };
  const readTailed = async (projectId: string) => {
    const tail = tailOf(projectId);
    const lines = await tail.read();
    return { journal: projectJournal(projectId, lines), length: tail.length() };
  };
  return async (projectIds) => {
    const read = await Promise.all(projectIds.map(readTailed));
    return { journals: read.map(({ journal }) => journal), lengths: new Map(read.map(({ journal, length }) => [journal.projectId, length])) };
  };
}

function createBaseMemo(): MemoizedBase {
  const memo = new Map<string, { key: string; base: ReportBase }>();
  return (slot, input, { revision, lengths }) => {
    const slotKey = `${slot}|${input.projectId ?? "*"}`;
    const readLengths = [...lengths].filter(([projectId]) => input.projectId === undefined || projectId === input.projectId);
    const key = `${revision.boot}:${revision.seq}|${slotKey}|${readLengths.map(([projectId, length]) => `${projectId}=${length}`).join(",")}`;
    const remembered = memo.get(slotKey);
    if (remembered?.key === key) return remembered.base;
    const base = reportBase(input);
    memo.set(slotKey, { key, base });
    return base;
  };
}

async function projectGraphs(projects: readonly Project[], tasks: readonly Task[], home: string): Promise<ProjectGraphRow[]> {
  return Promise.all(
    projects.map(async (project) => ({ projectId: project.id, name: project.name, ...(await projectGraphHealth(project, tasks, home)) })),
  );
}

function bucketsOf(cache: UsageCache) {
  return Object.values(cache.files).flatMap((entry) => entry.buckets);
}

async function resolveRepoRoots(lookupRepoRoot: RepoRootLookup, cwds: readonly string[]): Promise<Map<string, GitRoots | null>> {
  const unique = [...new Set(cwds)];
  return new Map(await Promise.all(unique.map(async (cwd) => [cwd, await lookupRepoRoot(cwd)] as const)));
}
