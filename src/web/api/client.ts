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

const CONFLICT_STATUS = 409;
const SERVER_FAILURE_STATUS = 500;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errors: string[],
    readonly current?: Task,
  ) {
    super(errors.length > 0 ? errors.join("; ") : `backlog api error, status ${status}`);
    this.name = "ApiError";
  }

  get isConflict(): boolean {
    return this.status === CONFLICT_STATUS;
  }

  get isServerFailure(): boolean {
    return this.status >= SERVER_FAILURE_STATUS;
  }
}

export type ApiClient = {
  projects: () => Promise<ProjectsResponse>;
  setProjectActive: (id: string, active: boolean) => Promise<Project>;
  deleteProject: (id: string, confirm: string) => Promise<void>;
  tasks: () => Promise<TasksResponse>;
  updateTask: (id: string, version: string, changes: TaskChangesRequest) => Promise<Task>;
  batchTasks: (request: BatchRequest) => Promise<BatchResponse>;
  statsReport: <K extends StatsReportKind>(kind: K, projectId?: string) => Promise<StatsReports[K]>;
  memorySamples: () => Promise<MemorySamplesResponse>;
  settings: () => Promise<SettingsResponse>;
  setLanguage: (language: Language) => Promise<SettingsResponse>;
};

const UNREACHABLE_STATUS = 0;
const GATEWAY_STATUSES = new Set([502, 504]);
const SERVICE_UNAVAILABLE_STATUS = 503;

export function isServerUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.status === UNREACHABLE_STATUS;
}

export function createApiClient(apiFetch: ApiFetch): ApiClient {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await apiFetch(path, init).catch(() => {
      throw unreachable();
    });
    if (GATEWAY_STATUSES.has(response.status)) throw unreachable();
    const body: unknown = await response.json().catch(() => {
      throw unreachable();
    });
    if (response.ok) return body as T;
    const { errors = [], current } = body as Partial<ConflictResponse>;
    if (response.status === SERVICE_UNAVAILABLE_STATUS && errors.length === 0) throw unreachable();
    throw new ApiError(response.status, errors, current);
  };
  return {
    projects: () => request<ProjectsResponse>("/api/projects"),
    setProjectActive: (id, active) => request<Project>(projectPath(id), jsonInit("PATCH", { active })),
    deleteProject: async (id, confirm) => {
      await request<ProjectDeletedResponse>(projectPath(id), jsonInit("DELETE", { confirm }));
    },
    tasks: () => request<TasksResponse>("/api/tasks"),
    updateTask: (id, version, changes) => request<Task>(`/api/tasks/${encodeURIComponent(id)}`, jsonInit("PATCH", { version, changes })),
    batchTasks: (batch) => request<BatchResponse>("/api/tasks/batch", jsonInit("POST", batch)),
    statsReport: (kind, projectId) => request(scopedPath(`/api${STATS_REPORT_ROUTES[kind]}`, projectId)),
    memorySamples: () => request<MemorySamplesResponse>(`/api${STATS_MEMORY_ROUTE}`),
    settings: () => request<SettingsResponse>("/api/settings"),
    setLanguage: (language) => request<SettingsResponse>("/api/settings", jsonInit("PATCH", { language })),
  };
}

function unreachable(): ApiError {
  return new ApiError(UNREACHABLE_STATUS, []);
}

function projectPath(id: string): string {
  return `/api/projects/${encodeURIComponent(id)}`;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } };
}

function scopedPath(path: string, projectId: string | undefined): string {
  return projectId === undefined ? path : `${path}?project=${encodeURIComponent(projectId)}`;
}
