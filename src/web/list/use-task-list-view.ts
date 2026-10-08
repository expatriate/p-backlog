import { useMemo } from "react";
import { countOpenTasks, projectNameOf, taskScope } from "../app/scope";
import { buildIndex } from "../../core/model/graph";
import { filterListTasks, sortTasks } from "../../core/model/query";
import { localeOf, type Language } from "../../core/i18n/language";
import type { Task } from "../../core/model/types";
import { useProjects, useTasks } from "../app/queries";
import { useLanguage } from "../i18n";
import { epicTones } from "../ui/epic-tone";
import { epicChoices } from "./epic-choices";
import { AUTO_CLOSED_VIEW, dateColumnFor, followDateColumn, type ListParams } from "./list-params";

type ListContent = "failed" | "loading" | "unknownProject" | "empty" | "table";

export type TaskListView = ReturnType<typeof useTaskListView>;

export function useTaskListView(params: ListParams, projectId: string | undefined) {
  const language = useLanguage();
  const tasks = useTasks();
  const projects = useProjects();

  const dateColumn = dateColumnFor(params.filter);
  const sort = useMemo(() => followDateColumn(params.sort, dateColumn), [params.sort, dateColumn]);
  const allTasks = useMemo(() => tasks.data?.tasks ?? [], [tasks.data]);
  const isInScope = useMemo(() => taskScope(projects.data, projectId), [projects.data, projectId]);
  const scopedTasks = useMemo(() => (isInScope === undefined ? [] : allTasks.filter(isInScope)), [allTasks, isInScope]);
  const all = useMemo(() => ({ tasks: allTasks, index: buildIndex(allTasks), tones: epicTones(allTasks) }), [allTasks]);
  const { index, tones } = all;
  const filterContext = useMemo(() => ({ index, closedInWeb: new Set(tasks.data?.closedInWeb) }), [index, tasks.data]);
  const visibleTasks = useMemo(() => sortTasks(filterListTasks(scopedTasks, params.filter, filterContext), sort, index, language), [scopedTasks, index, filterContext, params.filter, sort, language]);
  const epicFilterChoices = useMemo(() => epicChoices(scopedTasks, tones), [scopedTasks, tones]);
  const autoClosedCount = useMemo(() => filterListTasks(scopedTasks, AUTO_CLOSED_VIEW.filter, filterContext).length, [scopedTasks, filterContext]);
  const tags = useMemo(() => collectTags(scopedTasks, language), [scopedTasks, language]);
  const hiddenOpen = useMemo(() => (projectId === undefined && isInScope !== undefined ? countOpenTasks(allTasks, isInScope).outOfScope : 0), [allTasks, isInScope, projectId]);

  const failedQueries = [tasks, projects].filter((query) => query.error !== null);
  const error = tasks.error ?? projects.error;
  const refetch = () => Promise.all(failedQueries.map((query) => query.refetch()));
  const unknownProject = projectId !== undefined && projects.data !== undefined && !projects.data.some((project) => project.id === projectId);
  const content = listContentOf({ hasData: tasks.data !== undefined && isInScope !== undefined, failed: error !== null, unknownProject, visibleCount: visibleTasks.length });

  return {
    tasksLoaded: tasks.data !== undefined,
    request: { error, isFetching: failedQueries.some((query) => query.isFetching), refetch },
    content,
    settled: content === "table" && error === null,
    projectName: projectId === undefined ? undefined : projectNameOf(projects.data, projectId),
    parseErrors: (tasks.data?.errors ?? []).filter((parseError) => projectId === undefined || parseError.projectId === projectId),
    all,
    table: { tasks: visibleTasks, sort, dateColumn },
    filterChoices: { tags, epicChoices: epicFilterChoices, autoClosedCount },
    empty: { hasTasks: scopedTasks.length > 0, hiddenOpen },
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
