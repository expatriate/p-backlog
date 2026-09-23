import type {
  CodeReport,
  ConflictResponse,
  CostReport,
  EffectReport,
  MemorySamplesResponse,
  ProjectDeletedResponse,
  ProjectView,
  QualityReport,
  SignalsReport,
  StatsReport,
  TaskChangesRequest,
  TasksResponse,
} from "../../core/api/contract";
import type { Project, Task } from "../../core/model/types";

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errors: string[],
    readonly current?: Task,
  ) {
    super(errors.length > 0 ? errors.join("; ") : fallbackMessage(status));
    this.name = "ApiError";
  }
}

export type ApiClient = {
  projects: () => Promise<ProjectView[]>;
  setProjectActive: (id: string, active: boolean) => Promise<Project>;
  deleteProject: (id: string, confirm: string) => Promise<void>;
  tasks: () => Promise<TasksResponse>;
  updateTask: (id: string, version: string, changes: TaskChangesRequest) => Promise<Task>;
  stats: (projectId?: string) => Promise<StatsReport>;
  codeStats: (projectId?: string) => Promise<CodeReport>;
  effectStats: (projectId?: string) => Promise<EffectReport>;
  qualityStats: (projectId?: string) => Promise<QualityReport>;
  signals: (projectId?: string) => Promise<SignalsReport>;
  costStats: (projectId?: string) => Promise<CostReport>;
  memorySamples: () => Promise<MemorySamplesResponse>;
};

const UNREACHABLE_STATUS = 0;
const GATEWAY_STATUSES = new Set([502, 503, 504]);

export function isServerUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.status === UNREACHABLE_STATUS;
}

export function unreachableMessage<T>(command: (text: string) => T): Array<string | T> {
  return [
    "Сервер беклога не отвечает. Запустите его: ",
    command("npm start"),
    " в репозитории p-backlog или, если установлен LaunchAgent из README, ",
    command("launchctl kickstart -k gui/$(id -u)/local.p-backlog"),
  ];
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
    throw new ApiError(response.status, errors, current);
  };
  return {
    projects: () => request<ProjectView[]>("/api/projects"),
    setProjectActive: (id, active) => request<Project>(projectPath(id), jsonInit("PATCH", { active })),
    deleteProject: async (id, confirm) => {
      await request<ProjectDeletedResponse>(projectPath(id), jsonInit("DELETE", { confirm }));
    },
    tasks: () => request<TasksResponse>("/api/tasks"),
    updateTask: (id, version, changes) => request<Task>(`/api/tasks/${id}`, jsonInit("PATCH", { version, changes })),
    stats: (projectId) => request<StatsReport>(scopedPath("/api/stats", projectId)),
    codeStats: (projectId) => request<CodeReport>(scopedPath("/api/stats/code", projectId)),
    effectStats: (projectId) => request<EffectReport>(scopedPath("/api/stats/effect", projectId)),
    qualityStats: (projectId) => request<QualityReport>(scopedPath("/api/stats/quality", projectId)),
    signals: (projectId) => request<SignalsReport>(scopedPath("/api/stats/signals", projectId)),
    costStats: (projectId) => request<CostReport>(scopedPath("/api/stats/cost", projectId)),
    memorySamples: () => request<MemorySamplesResponse>("/api/stats/memory"),
  };
}

function unreachable(): ApiError {
  return new ApiError(UNREACHABLE_STATUS, []);
}

function fallbackMessage(status: number): string {
  if (status === UNREACHABLE_STATUS) return unreachableMessage((command) => command).join("");
  return `Сервер вернул ошибку ${status}. Повторите; если не проходит — перезапустите сервер беклога.`;
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
