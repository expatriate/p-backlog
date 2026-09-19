import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useEffect } from "react";
import type { CodeReport, EffectReport, FlowReport, QualityReport, SignalsReport, StatsReport, TaskChangesRequest, TasksResponse } from "../../core/api/contract";
import type { Project, Task } from "../../core/model/types";
import { useBacklogApi } from "./backlog-api";

export const PROJECTS_KEY = ["projects"];
export const TASKS_KEY = ["tasks"];
export const STATS_KEY = ["stats"];

export function useProjects() {
  const { client } = useBacklogApi();
  return useQuery<Project[]>({ queryKey: PROJECTS_KEY, queryFn: client.projects });
}

export function useTasks() {
  const { client } = useBacklogApi();
  return useQuery<TasksResponse>({ queryKey: TASKS_KEY, queryFn: client.tasks });
}

export function useStats(projectId: string | undefined) {
  const { client } = useBacklogApi();
  return useQuery<StatsReport>({ queryKey: [...STATS_KEY, "overview", projectId ?? "all"], queryFn: () => client.stats(projectId) });
}

export function useFlowStats(projectId: string | undefined) {
  const { client } = useBacklogApi();
  return useQuery<FlowReport>({ queryKey: [...STATS_KEY, "flow", projectId ?? "all"], queryFn: () => client.flowStats(projectId) });
}

export function useCodeStats(projectId: string | undefined) {
  const { client } = useBacklogApi();
  return useQuery<CodeReport>({ queryKey: [...STATS_KEY, "code", projectId ?? "all"], queryFn: () => client.codeStats(projectId) });
}

export function useEffectStats(projectId: string | undefined) {
  const { client } = useBacklogApi();
  return useQuery<EffectReport>({ queryKey: [...STATS_KEY, "effect", projectId ?? "all"], queryFn: () => client.effectStats(projectId) });
}

export function useQualityStats(projectId: string | undefined) {
  const { client } = useBacklogApi();
  return useQuery<QualityReport>({ queryKey: [...STATS_KEY, "quality", projectId ?? "all"], queryFn: () => client.qualityStats(projectId) });
}

export function useSignals(projectId: string | undefined) {
  const { client } = useBacklogApi();
  return useQuery<SignalsReport>({ queryKey: [...STATS_KEY, "signals", projectId ?? "all"], queryFn: () => client.signals(projectId) });
}

export type UpdateTaskVariables = { id: string; version: string; changes: TaskChangesRequest };

export function useUpdateTask(): UseMutationResult<Task, Error, UpdateTaskVariables> {
  const { client } = useBacklogApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, changes }: UpdateTaskVariables) => client.updateTask(id, freshestVersion(queryClient, id) ?? version, changes),
    onSuccess: (task) => putTask(queryClient, task),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useLiveUpdates(): void {
  const { openEvents } = useBacklogApi();
  const queryClient = useQueryClient();
  useEffect(() => {
    const stream = openEvents();
    if (!stream) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      void queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      void queryClient.invalidateQueries({ queryKey: STATS_KEY });
    };
    stream.addEventListener("change", refresh);
    stream.addEventListener("open", refresh);
    return () => stream.close();
  }, [openEvents, queryClient]);
}

function freshestVersion(queryClient: ReturnType<typeof useQueryClient>, id: string): string | undefined {
  return queryClient.getQueryData<TasksResponse>(TASKS_KEY)?.tasks.find((task) => task.id === id)?.version;
}

function putTask(queryClient: ReturnType<typeof useQueryClient>, task: Task): void {
  queryClient.setQueryData<TasksResponse>(TASKS_KEY, (current) =>
    current === undefined
      ? current
      : { ...current, tasks: current.tasks.map((candidate) => (candidate.id === task.id ? task : candidate)) },
  );
}
