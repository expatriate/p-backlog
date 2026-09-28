import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryOptions } from "@tanstack/react-query";
import type {
  BatchRequest,
  BatchResponse,
  MemorySamplesResponse,
  ProjectsResponse,
  ProjectView,
  ScanProgress,
  SettingsResponse,
  TaskChangesRequest,
  TasksResponse,
} from "../../core/api/contract";
import { MEMORY_SAMPLE_INTERVAL_MS } from "../../core/api/memory";
import type { StatsReportKind, StatsReports } from "../../core/api/stats-routes";
import type { Language } from "../../core/i18n/language";
import type { Project, Task } from "../../core/model/types";
import { ApiError, type ApiClient } from "../api/client";
import { useBacklogApi } from "./backlog-api";
import { batchInChunks } from "./batch-chunks";
import { invalidateBacklogAndStats, invalidateBacklogOnly, MEMORY_SAMPLES_KEY, PROJECTS_KEY, SETTINGS_KEY, statsReportKey, TASKS_KEY } from "./query-keys";

const STATS_STALE_MS = 60_000;
const COST_SCAN_POLL_MS = 10_000;

export function useSettings() {
  const { client } = useBacklogApi();
  return useQuery<SettingsResponse>({ queryKey: SETTINGS_KEY, queryFn: client.settings });
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
  return useQuery<ProjectsResponse, Error, ProjectView[]>({ queryKey: PROJECTS_KEY, queryFn: client.projects, select: selectProjects });
}

export function useTasks() {
  const { client } = useBacklogApi();
  return useQuery<TasksResponse>({ queryKey: TASKS_KEY, queryFn: client.tasks });
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
  return useQuery<MemorySamplesResponse>({ queryKey: MEMORY_SAMPLES_KEY, queryFn: client.memorySamples, refetchInterval: MEMORY_SAMPLE_INTERVAL_MS });
}

function scanInProgress(scan: ScanProgress | undefined): boolean {
  if (scan === undefined) return false;
  return !scan.listed || scan.bytesLeft > 0;
}

function useReportQuery<K extends StatsReportKind>(kind: K, projectId: string | undefined, freshness: Partial<UseQueryOptions<StatsReports[K]>>) {
  const { client } = useBacklogApi();
  return useQuery<StatsReports[K]>({ queryKey: statsReportKey(kind, projectId), queryFn: () => client.statsReport(kind, projectId), ...freshness });
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

const TASK_SAVES = { id: "task-saves" };

export class TaskGoneError extends Error {
  constructor(readonly taskId: string) {
    super(`task ${taskId} is not in the loaded backlog`);
    this.name = "TaskGoneError";
  }
}

export function useUpdateTask(): UseMutationResult<Task, Error, UpdateTaskVariables> {
  const { client } = useBacklogApi();
  const queryClient = useQueryClient();
  return useMutation({
    scope: TASK_SAVES,
    mutationFn: ({ id, change, bodyEdit }: UpdateTaskVariables) => {
      const task = freshestTask(queryClient, id);
      if (!task) throw new TaskGoneError(id);
      const changes = change(task);
      return bodyEdit === undefined ? client.updateTask(id, task.version, changes) : saveEditedBody(client, id, changes, bodyEdit);
    },
    onSuccess: (task) => putTask(queryClient, task),
    onSettled: () => invalidateBacklogOnly(queryClient),
  });
}

export function useBatchTasks(): UseMutationResult<BatchResponse, Error, BatchRequest> {
  const { client, batchChunkSize } = useBacklogApi();
  const queryClient = useQueryClient();
  return useMutation({
    scope: TASK_SAVES,
    mutationFn: (request: BatchRequest) => batchInChunks(client, request, batchChunkSize),
    onSettled: () => void invalidateBacklogOnly(queryClient),
  });
}

async function saveEditedBody(client: ApiClient, id: string, changes: TaskChangesRequest, edit: BodyEdit): Promise<Task> {
  try {
    return await client.updateTask(id, edit.version, changes);
  } catch (error) {
    if (!(error instanceof ApiError) || error.current?.body !== edit.body) throw error;
    return await client.updateTask(id, error.current.version, changes);
  }
}

function freshestTask(queryClient: QueryClient, id: string): Task | undefined {
  return queryClient.getQueryData<TasksResponse>(TASKS_KEY)?.tasks.find((task) => task.id === id);
}

function putTask(queryClient: QueryClient, task: Task): void {
  queryClient.setQueryData<TasksResponse>(TASKS_KEY, (current) =>
    current === undefined
      ? current
      : { ...current, tasks: current.tasks.map((candidate) => (candidate.id === task.id ? task : candidate)) },
  );
}
