import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryOptions } from "@tanstack/react-query";
import { useEffect } from "react";
import type { BatchRequest, BatchResponse, MemorySamplesResponse, ProjectView, SettingsResponse, TaskChangesRequest, TasksResponse } from "../../core/api/contract";
import { MEMORY_SAMPLE_INTERVAL_MS } from "../../core/api/memory";
import type { Language } from "../../core/i18n/language";
import type { Project, Task } from "../../core/model/types";
import { ApiError, type ApiClient } from "../api/client";
import { useBacklogApi } from "./backlog-api";

const PROJECTS_KEY = ["projects"];
const TASKS_KEY = ["tasks"];
const STATS_KEY = ["stats"];
const SETTINGS_KEY = ["settings"];

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
      return queryClient.invalidateQueries();
    },
  });
}

export function useProjects() {
  const { client } = useBacklogApi();
  return useQuery<ProjectView[]>({ queryKey: PROJECTS_KEY, queryFn: client.projects });
}

export function useTasks() {
  const { client } = useBacklogApi();
  return useQuery<TasksResponse>({ queryKey: TASKS_KEY, queryFn: client.tasks });
}

export function useStats(projectId: string | undefined) {
  return useStatsReport("overview", projectId, (client) => client.stats(projectId));
}

export function useCodeStats(projectId: string | undefined) {
  return useStatsReport("code", projectId, (client) => client.codeStats(projectId));
}

export function useEffectStats(projectId: string | undefined) {
  return useStatsReport("effect", projectId, (client) => client.effectStats(projectId));
}

export function useQualityStats(projectId: string | undefined) {
  return useStatsReport("quality", projectId, (client) => client.qualityStats(projectId));
}

export function useSignals(projectId: string | undefined) {
  return useStatsReport("signals", projectId, (client) => client.signals(projectId));
}

export function useCostStats(projectId: string | undefined) {
  return useStatsReport("cost", projectId, (client) => client.costStats(projectId), {
    staleTime: 0,
    refetchInterval: (query) => {
      const scan = query.state.data?.scan;
      return scan !== undefined && (!scan.listed || scan.bytesLeft > 0) ? COST_SCAN_POLL_MS : false;
    },
  });
}

export function useMemorySamples() {
  const { client } = useBacklogApi();
  return useQuery<MemorySamplesResponse>({ queryKey: [...STATS_KEY, "memory"], queryFn: client.memorySamples, refetchInterval: MEMORY_SAMPLE_INTERVAL_MS });
}

function useStatsReport<T>(report: string, projectId: string | undefined, fetchReport: (client: ApiClient) => Promise<T>, overrides: Partial<UseQueryOptions<T>> = {}) {
  const { client } = useBacklogApi();
  return useQuery<T>({ queryKey: [...STATS_KEY, report, projectId ?? "all"], queryFn: () => fetchReport(client), staleTime: STATS_STALE_MS, ...overrides });
}

export type SetProjectActiveVariables = { id: string; active: boolean };

export function useSetProjectActive(): UseMutationResult<Project, Error, SetProjectActiveVariables> {
  const { client } = useBacklogApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: SetProjectActiveVariables) => client.setProjectActive(id, active),
    onSuccess: () => invalidateFileData(queryClient),
  });
}

export type DeleteProjectVariables = { id: string; confirm: string };

export function useDeleteProject(): UseMutationResult<void, Error, DeleteProjectVariables> {
  const { client } = useBacklogApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirm }: DeleteProjectVariables) => client.deleteProject(id, confirm),
    onSuccess: () => invalidateFileData(queryClient),
  });
}

function invalidateFileData(queryClient: QueryClient): void {
  for (const queryKey of [PROJECTS_KEY, TASKS_KEY, STATS_KEY]) void queryClient.invalidateQueries({ queryKey });
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useBatchTasks(): UseMutationResult<BatchResponse, Error, BatchRequest> {
  const { client } = useBacklogApi();
  const queryClient = useQueryClient();
  return useMutation({
    scope: TASK_SAVES,
    mutationFn: (request: BatchRequest) => client.batchTasks(request),
    onSuccess: () => invalidateFileData(queryClient),
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

export function useLiveUpdates(): void {
  const { openEvents } = useBacklogApi();
  const queryClient = useQueryClient();
  useEffect(() => {
    const stream = openEvents();
    if (!stream) return;
    const refresh = () => invalidateFileData(queryClient);
    stream.addEventListener("change", refresh);
    stream.addEventListener("open", refresh);
    return () => stream.close();
  }, [openEvents, queryClient]);
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
