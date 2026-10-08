import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { StatsReportKind } from "../../core/api/stats-routes";

export const PROJECTS_KEY = ["projects"];
export const TASKS_KEY = ["tasks"];
export const STATS_KEY = ["stats"];
export const SETTINGS_KEY = ["settings"];
export const MEMORY_SAMPLES_KEY = [...STATS_KEY, "memory"];

export const REVISIONED_KEYS = [TASKS_KEY, PROJECTS_KEY];

export function statsReportKey(kind: StatsReportKind, projectId: string | undefined): QueryKey {
  return [...STATS_KEY, kind, { projectId }];
}

export function invalidateBacklogAndStats(queryClient: QueryClient): Promise<unknown> {
  return invalidateEach(queryClient, [...REVISIONED_KEYS, STATS_KEY]);
}

export function invalidateBacklogOnly(queryClient: QueryClient): Promise<unknown> {
  return invalidateEach(queryClient, REVISIONED_KEYS);
}

function invalidateEach(queryClient: QueryClient, queryKeys: readonly QueryKey[]): Promise<unknown> {
  return Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
