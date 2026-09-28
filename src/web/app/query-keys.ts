import type { QueryClient } from "@tanstack/react-query";

export const PROJECTS_KEY = ["projects"];
export const TASKS_KEY = ["tasks"];
export const STATS_KEY = ["stats"];
export const SETTINGS_KEY = ["settings"];

export const REVISIONED_KEYS = [TASKS_KEY, PROJECTS_KEY];

export function invalidateBacklogAndStats(queryClient: QueryClient): void {
  for (const queryKey of [...REVISIONED_KEYS, STATS_KEY]) void queryClient.invalidateQueries({ queryKey });
}

export function invalidateBacklogOnly(queryClient: QueryClient): Promise<unknown> {
  return Promise.all(REVISIONED_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
