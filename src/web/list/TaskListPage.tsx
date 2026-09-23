import { useEffect, useMemo, useRef, useState } from "react";
import { listPath, taskPath } from "../app/paths";
import { activeProjectIds, projectNameOf, tasksInScope } from "../app/scope";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { buildIndex } from "../../core/model/graph";
import { filterTasks, OPEN_STATUSES, sortTasks } from "../../core/model/query";
import { countRu } from "../../core/i18n/plural";
import type { Task } from "../../core/model/types";
import { useProjects, useTasks } from "../app/queries";
import { RequestErrorText } from "../app/RequestErrorText";
import { Button } from "../ui/Button";
import { RetryButton } from "../ui/RetryButton";
import { useStatusFocus } from "../ui/use-status-focus";
import { TaskPanel } from "../task/TaskPanel";
import { epicTones, toneOf } from "../ui/epic-tone";
import { epicChoices } from "./epic-choices";
import { Toolbar } from "./Toolbar";
import { TaskTable } from "./TaskTable";
import { useSeenTasks } from "./use-seen-tasks";
import { toggledTags } from "./tag-filter";
import { AUTO_CLOSED_VIEW, DEFAULT_FILTER, dateColumnFor, followDateColumn, isDefaultFilter, pickSortKey, readListParams, writeListParams, type ListParams } from "./list-params";
import styles from "./TaskListPage.module.css";

const COUNT_ANNOUNCE_DELAY_MS = 500;

export function TaskListPage() {
  const { projectId, taskId } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { data, isFetching, error, refetch } = useTasks();
  const projects = useProjects();
  const { isNew, markSeen } = useSeenTasks();

  const searchKey = search.toString();
  const params = useMemo(() => readListParams(new URLSearchParams(searchKey)), [searchKey]);
  const dateColumn = dateColumnFor(params.filter);
  const sort = useMemo(() => followDateColumn(params.sort, dateColumn), [params.sort, dateColumn]);
  const allTasks = useMemo(() => data?.tasks ?? [], [data]);
  const activeIds = useMemo(() => activeProjectIds(projects.data ?? []), [projects.data]);
  const scopedTasks = useMemo(() => tasksInScope(allTasks, projectId, activeIds), [allTasks, projectId, activeIds]);
  const index = useMemo(() => buildIndex(allTasks), [allTasks]);
  const tones = useMemo(() => epicTones(allTasks), [allTasks]);
  const visibleTasks = useMemo(() => sortTasks(filterTasks(scopedTasks, params.filter, index), sort, index), [scopedTasks, index, params.filter, sort]);
  const epicFilterChoices = useMemo(() => epicChoices(scopedTasks, tones), [scopedTasks, tones]);
  const autoClosedCount = useMemo(() => filterTasks(scopedTasks, AUTO_CLOSED_VIEW.filter, index).length, [scopedTasks, index]);
  const tags = useMemo(() => collectTags(scopedTasks), [scopedTasks]);
  const hiddenOpen = useMemo(
    () => (projectId === undefined && projects.data !== undefined ? allTasks.filter((task) => !activeIds.has(task.projectId) && OPEN_STATUSES.includes(task.status)).length : 0),
    [allTasks, activeIds, projectId, projects.data],
  );

  const selectedTask = taskId === undefined ? undefined : allTasks.find((task) => task.id === taskId);
  const missingTask = taskId !== undefined && data !== undefined && selectedTask === undefined;
  const unknownProject = projectId !== undefined && projects.data !== undefined && !projects.data.some((project) => project.id === projectId);
  const projectName = projectId === undefined ? undefined : projectNameOf(projects.data, projectId);
  const viewTitle = viewTitleFor(projectName, params.filter.onlyAutoClosed === true);
  useEffect(() => {
    document.title = selectedTask === undefined ? `${viewTitle} — Беклог` : `${selectedTask.id} · ${selectedTask.title} — Беклог`;
  }, [viewTitle, selectedTask]);

  const setParams = (next: ListParams) => setSearch(writeListParams(next), { replace: true });
  const taskHref = (id: string) => ({ pathname: taskPath(projectId, id), search: searchKey });
  useEffect(() => {
    if (selectedTask !== undefined) markSeen(selectedTask);
  }, [selectedTask, markSeen]);
  const parseErrors = (data?.errors ?? []).filter((parseError) => projectId === undefined || parseError.projectId === projectId);
  const content = listContentOf({ hasData: data !== undefined, failed: error !== null, unknownProject, visibleCount: visibleTasks.length });
  const settled = content === "table" && error === null;
  const shownCount = settled ? visibleTasks.length : null;
  const announcedCount = useSettledValue(shownCount, COUNT_ANNOUNCE_DELAY_MS) ?? shownCount ?? 0;
  const heading = useRef<HTMLHeadingElement>(null);
  const { status, keepFocus } = useStatusFocus(settled, heading);

  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      <div className={styles.list}>
        <h1 ref={heading} tabIndex={-1} className={styles.heading}>
          {viewTitle}
        </h1>
        <Toolbar params={params} onChange={setParams} tags={tags} epicChoices={epicFilterChoices} autoClosedCount={autoClosedCount} />

        <p className={missingTask ? styles.warning : "visually-hidden"} role="status">
          {missingTask && `Задачи ${taskId} нет — возможно, её удалили после закрытия.`}
        </p>

        <div className={parseErrors.length > 0 ? styles.warning : "visually-hidden"} role="status">
          {parseErrors.length > 0 && (
            <>
              <strong>Не удалось разобрать файлы:</strong>
              <ul>
                {parseErrors.map((parseError) => (
                  <li key={parseError.path}>
                    {parseError.path} — {parseError.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className={styles.tableWrap}>
          <div ref={status} tabIndex={-1} role="status" className={settled ? "visually-hidden" : styles.hint}>
            {error !== null && (
              <>
                <p>
                  <RequestErrorText error={error} />
                </p>
                <RetryButton
                  fetching={isFetching}
                  onRetry={() => {
                    keepFocus();
                    void refetch();
                  }}
                />
              </>
            )}
            {content === "loading" && <p>Загружаем задачи…</p>}
            {content === "unknownProject" && <p>Проект не найден.</p>}
            {content === "empty" && (
              <EmptyList
                hasTasks={scopedTasks.length > 0}
                hiddenOpen={hiddenOpen}
                filter={params.filter}
                onFilterChange={(filter) => {
                  keepFocus();
                  setParams({ ...params, filter });
                }}
              />
            )}
            {settled && <p>В списке {countRu(announcedCount, "задача", "задачи", "задач")}</p>}
          </div>
          {content === "table" && (
            <TaskTable
              tasks={visibleTasks}
              index={index}
              selectedId={selectedTask?.id}
              sort={sort}
              dateColumn={dateColumn}
              onSort={(key) => setParams({ ...params, sort: pickSortKey(sort, key) })}
              taskHref={taskHref}
              tones={tones}
              isNew={isNew}
              selectedTags={params.filter.tags ?? []}
              onToggleTag={(tag) => setParams({ ...params, filter: { ...params.filter, tags: toggledTags(params.filter.tags ?? [], tag) } })}
            />
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskPanel
          key={selectedTask.id}
          task={selectedTask}
          tasks={allTasks}
          index={index}
          taskHref={taskHref}
          onClose={() => navigate({ pathname: listPath(projectId), search: searchKey })}
          tone={toneOf(selectedTask, tones)}
        />
      )}
    </main>
  );
}

function EmptyList({
  hasTasks,
  hiddenOpen,
  filter,
  onFilterChange,
}: {
  hasTasks: boolean;
  hiddenOpen: number;
  filter: ListParams["filter"];
  onFilterChange: (filter: ListParams["filter"]) => void;
}) {
  const hiddenNote = `Ещё ${countRu(hiddenOpen, "открытая задача", "открытые задачи", "открытых задач")} — в проектах без галочки.`;
  if (!hasTasks) {
    if (hiddenOpen > 0) return <p>В учтённых проектах задач нет. {hiddenNote}</p>;
    return (
      <p>
        Задач пока нет. Беклог наполняет агент: он записывает задачи командой <code className="inline-code">backlog new</code>, пока работает над кодом.
      </p>
    );
  }
  if (isDefaultFilter(filter)) {
    return (
      <>
        <p>{hiddenOpen > 0 ? `В учтённых проектах открытых задач нет. ${hiddenNote}` : "Открытых задач нет."}</p>
        <Button onClick={() => onFilterChange({ statuses: undefined })}>Показать все статусы</Button>
      </>
    );
  }
  return (
    <>
      <p>Под фильтры ничего не подходит.</p>
      <Button onClick={() => onFilterChange(DEFAULT_FILTER)}>Сбросить фильтры</Button>
    </>
  );
}

type ListContent = "failed" | "loading" | "unknownProject" | "empty" | "table";

function listContentOf({ hasData, failed, unknownProject, visibleCount }: { hasData: boolean; failed: boolean; unknownProject: boolean; visibleCount: number }): ListContent {
  if (!hasData) return failed ? "failed" : "loading";
  if (unknownProject) return "unknownProject";
  return visibleCount === 0 ? "empty" : "table";
}

function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

function viewTitleFor(projectName: string | undefined, onlyAutoClosed: boolean): string {
  if (onlyAutoClosed) return projectName === undefined ? "Закрыты агентом" : `Закрыты агентом · ${projectName}`;
  return projectName ?? "Проекты";
}

function collectTags(tasks: readonly Task[]): string[] {
  return [...new Set(tasks.flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b, "ru"));
}
