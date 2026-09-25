import { useMemo } from "react";
import { activeProjectIds, projectNameOf, tasksInScope } from "../app/scope";
import { buildIndex } from "../../core/model/graph";
import { filterTasks, OPEN_STATUSES, sortTasks } from "../../core/model/query";
import { localeOf, type Language } from "../../core/i18n/language";
import type { Task } from "../../core/model/types";
import { useProjects, useTasks } from "../app/queries";
import { useLanguage } from "../i18n";
import { epicTones } from "../ui/epic-tone";
import { epicChoices } from "./epic-choices";
import { AUTO_CLOSED_VIEW, dateColumnFor, followDateColumn, type ListParams } from "./list-params";

export type ListContent = "failed" | "loading" | "unknownProject" | "empty" | "table";

export function useTaskListView(params: ListParams, projectId: string | undefined) {
  const language = useLanguage();
  const { data, isFetching, error, refetch } = useTasks();
  const projects = useProjects();

  const dateColumn = dateColumnFor(params.filter);
  const sort = useMemo(() => followDateColumn(params.sort, dateColumn), [params.sort, dateColumn]);
  const allTasks = useMemo(() => data?.tasks ?? [], [data]);
  const activeIds = useMemo(() => activeProjectIds(projects.data ?? []), [projects.data]);
  const scopedTasks = useMemo(() => tasksInScope(allTasks, projectId, activeIds), [allTasks, projectId, activeIds]);
  const index = useMemo(() => buildIndex(allTasks), [allTasks]);
  const tones = useMemo(() => epicTones(allTasks), [allTasks]);
  const visibleTasks = useMemo(() => sortTasks(filterTasks(scopedTasks, params.filter, index), sort, index, language), [scopedTasks, index, params.filter, sort, language]);
  const epicFilterChoices = useMemo(() => epicChoices(scopedTasks, tones), [scopedTasks, tones]);
  const autoClosedCount = useMemo(() => filterTasks(scopedTasks, AUTO_CLOSED_VIEW.filter, index).length, [scopedTasks, index]);
  const tags = useMemo(() => collectTags(scopedTasks, language), [scopedTasks, language]);
  const hiddenOpen = useMemo(
    () => (projectId === undefined && projects.data !== undefined ? allTasks.filter((task) => !activeIds.has(task.projectId) && OPEN_STATUSES.includes(task.status)).length : 0),
    [allTasks, activeIds, projectId, projects.data],
  );

  const unknownProject = projectId !== undefined && projects.data !== undefined && !projects.data.some((project) => project.id === projectId);
  const content = listContentOf({ hasData: data !== undefined, failed: error !== null, unknownProject, visibleCount: visibleTasks.length });

  return {
    loaded: data !== undefined,
    request: { error, isFetching, refetch },
    content,
    settled: content === "table" && error === null,
    projectName: projectId === undefined ? undefined : projectNameOf(projects.data, projectId),
    parseErrors: (data?.errors ?? []).filter((parseError) => projectId === undefined || parseError.projectId === projectId),
    allTasks,
    scopedTasks,
    visibleTasks,
    index,
    tones,
    sort,
    dateColumn,
    epicFilterChoices,
    autoClosedCount,
    tags,
    hiddenOpen,
  };
}

function listContentOf({ hasData, failed, unknownProject, visibleCount }: { hasData: boolean; failed: boolean; unknownProject: boolean; visibleCount: number }): ListContent {
  if (!hasData) return failed ? "failed" : "loading";
  if (unknownProject) return "unknownProject";
  return visibleCount === 0 ? "empty" : "table";
}

function collectTags(tasks: readonly Task[], language: Language): string[] {
  return [...new Set(tasks.flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b, localeOf(language)));
}
