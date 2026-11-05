import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryOptions } from "@tanstack/react-query";
import type { BatchRequest, BatchResponse, MemorySamplesResponse, ProjectsResponse, ProjectView, ScanProgress, SettingsResponse, TaskChangesRequest, TasksResponse } from "../../core/api/contract";
import { MEMORY_SAMPLE_INTERVAL_MS } from "../../core/api/memory";
import type { StatsReportKind, StatsReports } from "../../core/api/stats-routes";
import type { Language } from "../../core/i18n/language";
import { normalizedBody } from "../../core/model/body";
import type { Project, Task } from "../../core/model/types";
import { ApiError, type ApiClient, type Cancellable } from "../api/client";
import { useBacklogApi } from "./backlog-api";
import { batchInChunks } from "./batch-chunks";
import { invalidateBacklogAndStats, invalidateBacklogOnly, MEMORY_SAMPLES_KEY, PROJECTS_KEY, SETTINGS_KEY, statsReportKey, TASKS_KEY } from "./query-keys";

const STATS_STALE_MS = 60_000;
const COST_SCAN_POLL_MS = 10_000;

export function useSettings() {
  const { client } = useBacklogApi();
  return useQuery<SettingsResponse>({ queryKey: SETTINGS_KEY, queryFn: ({ signal }) => client.settings({ signal }) });
}

export function useSetLanguage(): UseMutationResult<SettingsResponse, Error, Language> {
  const { client } = useBacklogApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (language: Language) => client.setLanguage(language),
    onSuccess: (settings) => {
      queryClient.setQueryData(SETTINGS_KEY, settings);
      void queryClient.invalidateQueries();
    },
  });
}

export function useProjects() {
  const { client } = useBacklogApi();
  return useQuery<ProjectsResponse, Error, ProjectView[]>({ queryKey: PROJECTS_KEY, queryFn: ({ signal }) => client.projects({ signal }), select: selectProjects });
}

export function useTasks() {
  const { client } = useBacklogApi();
  return useQuery<TasksResponse>({ queryKey: TASKS_KEY, queryFn: ({ signal }) => client.tasks({ signal }) });
}

function selectProjects(response: ProjectsResponse): ProjectView[] {
  return response.projects;
}

export function useStatsReport<K extends Exclude<StatsReportKind, "cost">>(kind: K, projectId: string | undefined) {
  return useReportQuery(kind, projectId, { staleTime: STATS_STALE_MS });
}

export function useCostReport(projectId: string | undefined) {
  return useReportQuery("cost", projectId, {
    staleTime: 0,
    refetchInterval: (query) => (scanInProgress(query.state.data?.scan) ? COST_SCAN_POLL_MS : false),
  });
}

export function useMemorySamples() {
  const { client } = useBacklogApi();
  return useQuery<MemorySamplesResponse>({
    queryKey: MEMORY_SAMPLES_KEY,
    queryFn: ({ signal }) => client.memorySamples({ signal }),
    refetchInterval: MEMORY_SAMPLE_INTERVAL_MS,
    initialData: { samples: [] },
  });
}

function scanInProgress(scan: ScanProgress | undefined): boolean {
  if (scan === undefined) return false;
  return !scan.listed || scan.bytesLeft > 0;
}

function useReportQuery<K extends StatsReportKind>(kind: K, projectId: string | undefined, freshness: Partial<UseQueryOptions<StatsReports[K]>>) {
  const { client } = useBacklogApi();
  return useQuery<StatsReports[K]>({ queryKey: statsReportKey(kind, projectId), queryFn: ({ signal }) => client.statsReport(kind, projectId, { signal }), ...freshness });
}

export type SetProjectActiveVariables = { id: string; active: boolean };

export function useSetProjectActive(): UseMutationResult<Project, Error, SetProjectActiveVariables> {
  const { client } = useBacklogApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: SetProjectActiveVariables) => client.setProjectActive(id, active),
    onSuccess: () => void invalidateBacklogAndStats(queryClient),
  });
}

export type DeleteProjectVariables = { id: string; confirm: string };

export function useDeleteProject(): UseMutationResult<void, Error, DeleteProjectVariables> {
  const { client } = useBacklogApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirm }: DeleteProjectVariables) => client.deleteProject(id, confirm),
    onSuccess: () => void invalidateBacklogAndStats(queryClient),
  });
}

export type TaskChange = (task: Task) => TaskChangesRequest;
export type BodyEdit = { version: string; body: string };
export type UpdateTaskVariables = { id: string; change: TaskChange; bodyEdit?: BodyEdit };

type QueuedTaskSave = UpdateTaskVariables & { answerBy: AbortSignal };

const TASK_SAVES = { id: "task-saves" };

export class SaveNotSentError extends Error {
  constructor() {
    super("the save waited in the queue past its answer deadline and was not sent");
    this.name = "SaveNotSentError";
  }
}

export class TaskGoneError extends Error {
  constructor(readonly taskId: string) {
    super(`task ${taskId} is not in the loaded backlog`);
    this.name = "TaskGoneError";
  }
}

type TaskSave = { before: Task; saved: Task };

type TaskSaver = { save: (variables: UpdateTaskVariables) => Promise<TaskSave> };

export function useUpdateTask(): TaskSaver {
  const { client } = useBacklogApi();
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    scope: TASK_SAVES,
    mutationFn: async ({ id, change, bodyEdit, answerBy }: QueuedTaskSave) => {
      if (answerBy.aborted) throw new SaveNotSentError();
      const before = freshestTask(queryClient, id);
      if (!before) throw new TaskGoneError(id);
      const changes = change(before);
      const cancellable = { signal: answerBy };
      return landedDespiteConflict(before, changes, () =>
        bodyEdit === undefined ? client.updateTask(id, before.version, changes, cancellable) : saveEditedBody(client, id, changes, bodyEdit, cancellable),
      );
    },
    onSuccess: ({ saved }) => putTask(queryClient, saved),
    onSettled: () => invalidateBacklogOnly(queryClient),
  });
  return { save: (variables) => mutateAsync({ ...variables, answerBy: client.writeDeadline() }) };
}

async function landedDespiteConflict(before: Task, changes: TaskChangesRequest, save: () => Promise<Task>): Promise<TaskSave> {
  try {
    return { before, saved: await save() };
  } catch (error) {
    const current = error instanceof ApiError ? error.current : undefined;
    if (current !== undefined && carriesChanges(current, changes)) return { before: current, saved: current };
    throw error;
  }
}

function carriesChanges(task: Task, changes: TaskChangesRequest): boolean {
  const { body, ...fields } = changes;
  const bodyCarried = body === undefined || normalizedBody(task.body) === normalizedBody(body);
  return bodyCarried && Object.entries(fields).every(([field, value]) => JSON.stringify(task[field as keyof typeof fields] ?? null) === JSON.stringify(value ?? null));
}

export function useBatchTasks(): UseMutationResult<BatchResponse, Error, BatchRequest> {
  const { client, batchChunkSize } = useBacklogApi();
  const queryClient = useQueryClient();
  return useMutation({
    scope: TASK_SAVES,
    mutationFn: (request: BatchRequest) => batchInChunks(client, request, batchChunkSize),
    onSettled: () => invalidateBacklogOnly(queryClient),
  });
}

async function saveEditedBody(client: ApiClient, id: string, changes: TaskChangesRequest, edit: BodyEdit, cancellable: Cancellable): Promise<Task> {
  try {
    return await client.updateTask(id, edit.version, changes, cancellable);
  } catch (error) {
    if (!(error instanceof ApiError) || error.current?.body !== edit.body) throw error;
    return await client.updateTask(id, error.current.version, changes, cancellable);
  }
}

function freshestTask(queryClient: QueryClient, id: string): Task | undefined {
  return queryClient.getQueryData<TasksResponse>(TASKS_KEY)?.tasks.find((task) => task.id === id);
}

function putTask(queryClient: QueryClient, task: Task): void {
  queryClient.setQueryData<TasksResponse>(TASKS_KEY, (current) => (current === undefined ? current : { ...current, tasks: current.tasks.map((candidate) => (candidate.id === task.id ? task : candidate)) }));
}
