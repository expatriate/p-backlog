import type { CodeReport, ConflictResponse, ErrorResponse, FlowReport, StatsReport, TaskChangesRequest, TasksResponse } from "../../core/api/contract";
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
  projects: () => Promise<Project[]>;
  tasks: () => Promise<TasksResponse>;
  updateTask: (id: string, version: string, changes: TaskChangesRequest) => Promise<Task>;
  stats: (projectId?: string) => Promise<StatsReport>;
  flowStats: (projectId?: string) => Promise<FlowReport>;
  codeStats: (projectId?: string) => Promise<CodeReport>;
};

export function createApiClient(apiFetch: ApiFetch): ApiClient {
  const read = async <T>(response: Response): Promise<T> => {
    if (response.ok) return (await response.json()) as T;
    const body = (await response.json().catch(() => ({ errors: [`Ошибка ${response.status}`] }))) as ErrorResponse &
      Partial<ConflictResponse>;
    throw new ApiError(response.status, body.errors ?? [`Ошибка ${response.status}`], body.current);
  };
  return {
    projects: async () => read<Project[]>(await apiFetch("/api/projects")),
    tasks: async () => read<TasksResponse>(await apiFetch("/api/tasks")),
    updateTask: async (id, version, changes) =>
      read<Task>(
        await apiFetch(`/api/tasks/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ version, changes }),
          headers: { "content-type": "application/json" },
        }),
      ),
    stats: async (projectId) => read<StatsReport>(await apiFetch(scopedPath("/api/stats", projectId))),
    flowStats: async (projectId) => read<FlowReport>(await apiFetch(scopedPath("/api/stats/flow", projectId))),
    codeStats: async (projectId) => read<CodeReport>(await apiFetch(scopedPath("/api/stats/code", projectId))),
  };
}

function scopedPath(path: string, projectId: string | undefined): string {
  return projectId === undefined ? path : `${path}?project=${encodeURIComponent(projectId)}`;
}
