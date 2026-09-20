import { useEffect, useMemo } from "react";
import { listPath } from "../app/paths";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { buildIndex } from "../../core/model/graph";
import { filterTasks, sortTasks } from "../../core/model/query";
import type { Task } from "../../core/model/types";
import { useProjects, useTasks } from "../app/queries";
import { Button } from "../ui/Button";
import { TaskPanel } from "../task/TaskPanel";
import { epicTones, toneOf } from "../ui/epic-tone";
import { epicChoices } from "./epic-choices";
import { Toolbar } from "./Toolbar";
import { TaskTable } from "./TaskTable";
import { useSeenTasks } from "./use-seen-tasks";
import { toggledTags } from "./tag-filter";
import { AUTO_CLOSED_VIEW, DEFAULT_FILTER, dateColumnFor, followDateColumn, isDefaultFilter, pickSortKey, readListParams, writeListParams, type ListParams } from "./list-params";
import styles from "./TaskListPage.module.css";

export function TaskListPage() {
  const { projectId, taskId } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useTasks();
  const projects = useProjects();
  const { isNew, markSeen } = useSeenTasks();

  const searchKey = search.toString();
  const params = useMemo(() => readListParams(new URLSearchParams(searchKey)), [searchKey]);
  const dateColumn = dateColumnFor(params.filter);
  const sort = useMemo(() => followDateColumn(params.sort, dateColumn), [params.sort, dateColumn]);
  const allTasks = useMemo(() => data?.tasks ?? [], [data]);
  const index = useMemo(() => buildIndex(allTasks), [allTasks]);
  const tones = useMemo(() => epicTones(allTasks), [allTasks]);
  const visibleTasks = useMemo(
    () => sortTasks(filterTasks(allTasks, { ...params.filter, projectId }, index), sort, index),
    [allTasks, index, params.filter, sort, projectId],
  );
  const projectTasks = useMemo(
    () => (projectId === undefined ? allTasks : allTasks.filter((task) => task.projectId === projectId)),
    [allTasks, projectId],
  );
  const epicFilterChoices = useMemo(() => epicChoices(projectTasks, tones), [projectTasks, tones]);
  const autoClosedCount = filterTasks(allTasks, { projectId, ...AUTO_CLOSED_VIEW.filter }, index).length;

  const projectName =
    projectId === undefined ? undefined : (projects.data?.find((project) => project.id === projectId)?.name ?? projectId);
  const viewTitle = viewTitleFor(projectName, params.filter.onlyAutoClosed === true);
  useEffect(() => {
    document.title = `${viewTitle} — Беклог`;
  }, [viewTitle]);

  const setParams = (next: ListParams) => setSearch(writeListParams(next), { replace: true });
  const prefix = projectId === undefined ? "" : listPath(projectId);
  const taskHref = (id: string) => ({ pathname: `${prefix}/t/${id}`, search: searchKey });
  const selectedTask = taskId === undefined ? undefined : allTasks.find((task) => task.id === taskId);
  useEffect(() => {
    if (selectedTask !== undefined) markSeen(selectedTask);
  }, [selectedTask, markSeen]);
  const parseErrors = (data?.errors ?? []).filter((error) => projectId === undefined || error.projectId === projectId);

  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      <div className={styles.list}>
        <h1 className={styles.heading}>{viewTitle}</h1>
        <Toolbar params={params} onChange={setParams} tags={collectTags(projectTasks)} epicChoices={epicFilterChoices} autoClosedCount={autoClosedCount} />

        {parseErrors.length > 0 && (
          <div className={styles.warning} role="status">
            <strong>Не удалось разобрать файлы:</strong>
            <ul>
              {parseErrors.map((error) => (
                <li key={error.path}>
                  {error.path} — {error.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.tableWrap}>
          {isError ? (
            <div className={styles.hint} role="status">
              <p>
                Сервер беклога не отвечает. Запустите его: <code>npm start</code> в репозитории p-backlog или, если установлен LaunchAgent из README, <code>launchctl kickstart -k gui/$(id -u)/local.p-backlog</code>
              </p>
              <Button onClick={() => void refetch()}>Повторить</Button>
            </div>
          ) : isPending ? (
            <p className={styles.hint}>Загружаем задачи…</p>
          ) : visibleTasks.length === 0 ? (
            <EmptyList
              hasTasks={projectTasks.length > 0}
              filter={params.filter}
              onFilterChange={(filter) => setParams({ ...params, filter })}
            />
          ) : (
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
          onClose={() => navigate({ pathname: prefix === "" ? "/" : prefix, search: searchKey })}
          tone={toneOf(selectedTask, tones)}
        />
      )}
    </main>
  );
}

function EmptyList({
  hasTasks,
  filter,
  onFilterChange,
}: {
  hasTasks: boolean;
  filter: ListParams["filter"];
  onFilterChange: (filter: ListParams["filter"]) => void;
}) {
  if (!hasTasks) {
    return (
      <p className={styles.hint}>
        Задач пока нет. Беклог наполняет агент: он записывает задачи командой <code>backlog new</code>, пока работает над кодом.
      </p>
    );
  }
  if (isDefaultFilter(filter)) {
    return (
      <div className={styles.hint} role="status">
        <p>Открытых задач нет.</p>
        <Button onClick={() => onFilterChange({ statuses: undefined })}>Показать все статусы</Button>
      </div>
    );
  }
  return (
    <div className={styles.hint} role="status">
      <p>Под фильтры ничего не подходит.</p>
      <Button onClick={() => onFilterChange(DEFAULT_FILTER)}>Сбросить фильтры</Button>
    </div>
  );
}

function viewTitleFor(projectName: string | undefined, onlyAutoClosed: boolean): string {
  if (onlyAutoClosed) return projectName === undefined ? "Закрыты агентом" : `Закрыты агентом · ${projectName}`;
  return projectName ?? "Все проекты";
}

function collectTags(tasks: readonly Task[]): string[] {
  return [...new Set(tasks.flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b, "ru"));
}
