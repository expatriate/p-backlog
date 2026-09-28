import { useMemo } from "react";
import { projectNameOf, taskScope } from "../app/scope";
import { buildIndex, isClosed } from "../../core/model/graph";
import { filterTasks, sortTasks } from "../../core/model/query";
import { localeOf, type Language } from "../../core/i18n/language";
import type { Task } from "../../core/model/types";
import { useProjects, useTasks } from "../app/queries";
import { useLanguage } from "../i18n";
import { epicTones } from "./epic-tone";
import { epicChoices } from "./epic-choices";
import { AUTO_CLOSED_VIEW, dateColumnFor, followDateColumn, type ListParams } from "./list-params";

export type ListContent = "failed" | "loading" | "unknownProject" | "empty" | "table";

export function useTaskListView(params: ListParams, projectId: string | undefined) {
  const language = useLanguage();
  const tasks = useTasks();
  const projects = useProjects();

  const dateColumn = dateColumnFor(params.filter);
  const sort = useMemo(() => followDateColumn(params.sort, dateColumn), [params.sort, dateColumn]);
  const allTasks = useMemo(() => tasks.data?.tasks ?? [], [tasks.data]);
  const inScope = useMemo(() => taskScope(projects.data, projectId), [projects.data, projectId]);
  const scopedTasks = useMemo(() => (inScope === undefined ? [] : allTasks.filter(inScope)), [allTasks, inScope]);
  const index = useMemo(() => buildIndex(allTasks), [allTasks]);
  const filterContext = useMemo(() => ({ index, closedInWeb: new Set(tasks.data?.closedInWeb) }), [index, tasks.data]);
  const tones = useMemo(() => epicTones(allTasks), [allTasks]);
  const visibleTasks = useMemo(() => sortTasks(filterTasks(scopedTasks, params.filter, filterContext), sort, index, language), [scopedTasks, index, filterContext, params.filter, sort, language]);
  const epicFilterChoices = useMemo(() => epicChoices(scopedTasks, tones), [scopedTasks, tones]);
  const autoClosedCount = useMemo(() => filterTasks(scopedTasks, AUTO_CLOSED_VIEW.filter, filterContext).length, [scopedTasks, filterContext]);
  const tags = useMemo(() => collectTags(scopedTasks, language), [scopedTasks, language]);
  const hiddenOpen = useMemo(
    () => (projectId === undefined && inScope !== undefined ? allTasks.filter((task) => !inScope(task) && !isClosed(task.status)).length : 0),
    [allTasks, inScope, projectId],
  );

  const failedQueries = [tasks, projects].filter((query) => query.error !== null);
  const error = tasks.error ?? projects.error;
  const refetch = () => Promise.all(failedQueries.map((query) => query.refetch()));
  const unknownProject = projectId !== undefined && projects.data !== undefined && !projects.data.some((project) => project.id === projectId);
  const content = listContentOf({ hasData: tasks.data !== undefined && inScope !== undefined, failed: error !== null, unknownProject, visibleCount: visibleTasks.length });

  return {
    tasksLoaded: tasks.data !== undefined,
    request: { error, isFetching: failedQueries.some((query) => query.isFetching), refetch },
    content,
    settled: content === "table" && error === null,
    projectName: projectId === undefined ? undefined : projectNameOf(projects.data, projectId),
    parseErrors: (tasks.data?.errors ?? []).filter((parseError) => projectId === undefined || parseError.projectId === projectId),
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
