import type {
  CodeReport,
  ConflictResponse,
  CostReport,
  EffectReport,
  ErrorResponse,
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
    super(errors.join("; "));
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

export function createApiClient(apiFetch: ApiFetch): ApiClient {
  const read = async <T>(response: Response): Promise<T> => {
    if (response.ok) return (await response.json()) as T;
    const body = (await response.json().catch(() => ({ errors: [`Ошибка ${response.status}`] }))) as ErrorResponse &
      Partial<ConflictResponse>;
    throw new ApiError(response.status, body.errors ?? [`Ошибка ${response.status}`], body.current);
  };
  return {
    projects: async () => read<ProjectView[]>(await apiFetch("/api/projects")),
    setProjectActive: async (id, active) => read<Project>(await apiFetch(projectPath(id), jsonInit("PATCH", { active }))),
    deleteProject: async (id, confirm) => {
      await read<ProjectDeletedResponse>(await apiFetch(projectPath(id), jsonInit("DELETE", { confirm })));
    },
    tasks: async () => read<TasksResponse>(await apiFetch("/api/tasks")),
    updateTask: async (id, version, changes) => read<Task>(await apiFetch(`/api/tasks/${id}`, jsonInit("PATCH", { version, changes }))),
    stats: async (projectId) => read<StatsReport>(await apiFetch(scopedPath("/api/stats", projectId))),
    codeStats: async (projectId) => read<CodeReport>(await apiFetch(scopedPath("/api/stats/code", projectId))),
    effectStats: async (projectId) => read<EffectReport>(await apiFetch(scopedPath("/api/stats/effect", projectId))),
    qualityStats: async (projectId) => read<QualityReport>(await apiFetch(scopedPath("/api/stats/quality", projectId))),
    signals: async (projectId) => read<SignalsReport>(await apiFetch(scopedPath("/api/stats/signals", projectId))),
    costStats: async (projectId) => read<CostReport>(await apiFetch(scopedPath("/api/stats/cost", projectId))),
    memorySamples: async () => read<MemorySamplesResponse>(await apiFetch("/api/stats/memory")),
  };
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
