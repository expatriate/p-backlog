import type {
  BatchRequest,
  BatchResponse,
  ConflictResponse,
  MemorySamplesResponse,
  ProjectDeletedResponse,
  ProjectsResponse,
  SettingsResponse,
  TaskChangesRequest,
  TasksResponse,
} from "../../core/api/contract";
import { STATS_MEMORY_ROUTE, STATS_REPORT_ROUTES, type StatsReportKind, type StatsReports } from "../../core/api/stats-routes";
import type { Language } from "../../core/i18n/language";
import type { Project, Task } from "../../core/model/types";

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errors: string[],
    readonly current?: Task,
  ) {
    super(errors.length > 0 ? errors.join("; ") : `backlog api error, status ${status}`);
    this.name = "ApiError";
  }
}

export type Cancellable = { signal?: AbortSignal | undefined };

type RequestOptions = Omit<RequestInit, "signal"> & Cancellable;

export type ApiClient = {
  projects: (cancellable?: Cancellable) => Promise<ProjectsResponse>;
  setProjectActive: (id: string, active: boolean) => Promise<Project>;
  deleteProject: (id: string, confirm: string) => Promise<void>;
  tasks: (cancellable?: Cancellable) => Promise<TasksResponse>;
  updateTask: (id: string, version: string, changes: TaskChangesRequest, cancellable?: Cancellable) => Promise<Task>;
  batchTasks: (request: BatchRequest) => Promise<BatchResponse>;
  statsReport: <K extends StatsReportKind>(kind: K, projectId?: string, cancellable?: Cancellable) => Promise<StatsReports[K]>;
  memorySamples: (cancellable?: Cancellable) => Promise<MemorySamplesResponse>;
  settings: (cancellable?: Cancellable) => Promise<SettingsResponse>;
  setLanguage: (language: Language) => Promise<SettingsResponse>;
  writeDeadline: () => AbortSignal;
};

type ResponseTimeouts = { readMs: number; writeMs: number };

const RESPONSE_TIMEOUTS: ResponseTimeouts = { readMs: 60_000, writeMs: 120_000 };

const UNREACHABLE_STATUS = 0;
const TIMED_OUT_STATUS = -1;
const NOT_FOUND_STATUS = 404;
const CONFLICT_STATUS = 409;
const SERVER_FAILURE_STATUS = 500;
const GATEWAY_STATUSES = new Set([502, 504]);
const SERVICE_UNAVAILABLE_STATUS = 503;

type ApiErrorKind = "unreachable" | "timedOut" | "notFound" | "conflict" | "serverFailure" | "rejected";

export function apiErrorKind(error: unknown): ApiErrorKind | undefined {
  if (!(error instanceof ApiError)) return undefined;
  if (error.status === UNREACHABLE_STATUS) return "unreachable";
  if (error.status === TIMED_OUT_STATUS) return "timedOut";
  if (error.status === NOT_FOUND_STATUS) return "notFound";
  if (error.status === CONFLICT_STATUS) return "conflict";
  return error.status >= SERVER_FAILURE_STATUS ? "serverFailure" : "rejected";
}

export function createApiClient(apiFetch: ApiFetch, { readMs, writeMs }: ResponseTimeouts = RESPONSE_TIMEOUTS): ApiClient {
  const request = async <T>(path: string, init: RequestOptions = {}): Promise<T> => {
    const timeoutMs = (init.method ?? "GET") === "GET" ? readMs : writeMs;
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? abortedByEither(init.signal, deadline) : deadline;
    const response = await apiFetch(path, { ...init, signal }).catch((error: unknown) => {
      throw unansweredError(error);
    });
    if (GATEWAY_STATUSES.has(response.status)) throw unreachable();
    const body: unknown = await response.json().catch((error: unknown) => {
      throw unansweredError(error);
    });
    if (response.ok) return body as T;
    const { errors = [], current } = body as Partial<ConflictResponse>;
    if (response.status === SERVICE_UNAVAILABLE_STATUS && errors.length === 0) throw unreachable();
    throw new ApiError(response.status, errors, current);
  };
  return {
    projects: (cancellable) => request<ProjectsResponse>("/api/projects", cancellable),
    setProjectActive: (id, active) => request<Project>(projectPath(id), jsonInit("PATCH", { active })),
    deleteProject: async (id, confirm) => {
      await request<ProjectDeletedResponse>(projectPath(id), jsonInit("DELETE", { confirm }));
    },
    tasks: (cancellable) => request<TasksResponse>("/api/tasks", cancellable),
    updateTask: (id, version, changes, cancellable) => request<Task>(`/api/tasks/${encodeURIComponent(id)}`, { ...jsonInit("PATCH", { version, changes }), ...cancellable }),
    batchTasks: (batch) => request<BatchResponse>("/api/tasks/batch", jsonInit("POST", batch)),
    statsReport: (kind, projectId, cancellable) => request(scopedPath(`/api${STATS_REPORT_ROUTES[kind]}`, projectId), cancellable),
    memorySamples: (cancellable) => request<MemorySamplesResponse>(`/api${STATS_MEMORY_ROUTE}`, cancellable),
    settings: (cancellable) => request<SettingsResponse>("/api/settings", cancellable),
    setLanguage: (language) => request<SettingsResponse>("/api/settings", jsonInit("PATCH", { language })),
    writeDeadline: () => AbortSignal.timeout(writeMs),
  };
}

function abortedByEither(first: AbortSignal, second: AbortSignal): AbortSignal {
  const either = new AbortController();
  for (const signal of [first, second]) {
    if (signal.aborted) either.abort(signal.reason);
    else signal.addEventListener("abort", () => either.abort(signal.reason), { once: true });
  }
  return either.signal;
}

function unreachable(): ApiError {
  return new ApiError(UNREACHABLE_STATUS, []);
}

function unansweredError(error: unknown): ApiError {
  return error instanceof Error && error.name === "TimeoutError" ? new ApiError(TIMED_OUT_STATUS, []) : unreachable();
}

function projectPath(id: string): string {
  return `/api/projects/${encodeURIComponent(id)}`;
}

function jsonInit(method: string, body: unknown): RequestOptions {
  return { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } };
}

function scopedPath(path: string, projectId: string | undefined): string {
  return projectId === undefined ? path : `${path}?project=${encodeURIComponent(projectId)}`;
}
