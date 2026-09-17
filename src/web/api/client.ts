import type {
  ConflictResponse,
  EpicResponse,
  ErrorResponse,
  NewEpicRequest,
  NewTaskRequest,
  PartialEpicResponse,
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
    readonly epic?: Task,
  ) {
    super(errors.join("; "));
    this.name = "ApiError";
  }
}

export type ApiClient = {
  projects: () => Promise<Project[]>;
  tasks: () => Promise<TasksResponse>;
  createTask: (request: NewTaskRequest) => Promise<Task>;
  updateTask: (id: string, version: string, changes: TaskChangesRequest) => Promise<Task>;
  createEpic: (request: NewEpicRequest) => Promise<EpicResponse>;
};

export function createApiClient(apiFetch: ApiFetch): ApiClient {
  const read = async <T>(response: Response): Promise<T> => {
    if (response.ok) return (await response.json()) as T;
    const body = (await response.json().catch(() => ({ errors: [`Ошибка ${response.status}`] }))) as ErrorResponse &
      Partial<ConflictResponse> &
      Partial<PartialEpicResponse>;
    throw new ApiError(response.status, body.errors ?? [`Ошибка ${response.status}`], body.current, body.epic);
  };
  const send = async <T>(method: string, path: string, body: unknown): Promise<T> =>
    read<T>(await apiFetch(path, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

  return {
    projects: async () => read<Project[]>(await apiFetch("/api/projects")),
    tasks: async () => read<TasksResponse>(await apiFetch("/api/tasks")),
    createTask: (request) => send<Task>("POST", "/api/tasks", request),
    updateTask: (id, version, changes) => send<Task>("PATCH", `/api/tasks/${id}`, { version, changes }),
    createEpic: (request) => send<EpicResponse>("POST", "/api/epics", request),
  };
}
