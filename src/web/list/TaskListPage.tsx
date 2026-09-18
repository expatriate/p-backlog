import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { buildIndex } from "../../core/model/graph";
import { filterTasks, sortTasks } from "../../core/model/query";
import type { Task } from "../../core/model/types";
import { useTasks } from "../app/queries";
import { Button } from "../ui/Button";
import { TaskPanel } from "../task/TaskPanel";
import { Toolbar } from "./Toolbar";
import { TaskTable } from "./TaskTable";
import { readListParams, writeListParams } from "./list-params";
import styles from "./TaskListPage.module.css";

export function TaskListPage() {
  const { projectId, taskId } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useTasks();

  const searchKey = search.toString();
  const params = useMemo(() => readListParams(new URLSearchParams(searchKey)), [searchKey]);
  const allTasks = useMemo(() => data?.tasks ?? [], [data]);
  const index = useMemo(() => buildIndex(allTasks), [allTasks]);
  const visibleTasks = useMemo(
    () => sortTasks(filterTasks(allTasks, { ...params.filter, projectId }, index), params.sort, index),
    [allTasks, index, params.filter, params.sort, projectId],
  );
  const projectTasks = useMemo(
    () => (projectId === undefined ? allTasks : allTasks.filter((task) => task.projectId === projectId)),
    [allTasks, projectId],
  );

  const prefix = projectId === undefined ? "" : `/p/${projectId}`;
  const withSearch = (path: string) => ({ pathname: path === "" ? "/" : path, search: search.toString() });
  const selectedTask = taskId === undefined ? undefined : allTasks.find((task) => task.id === taskId);
  const parseErrors = (data?.errors ?? []).filter((error) => projectId === undefined || error.projectId === projectId);

  return (
    <main className={styles.page}>
      <div className={styles.list}>
        <Toolbar
          params={params}
          onChange={(next) => setSearch(writeListParams(next), { replace: true })}
          tags={collectTags(projectTasks)}
          epics={projectTasks.filter((task) => task.type === "epic")}
        />

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
              <p>Не удалось получить задачи. Проверьте, что сервер запущен: <code>npm start</code>.</p>
              <Button onClick={() => void refetch()}>Повторить</Button>
            </div>
          ) : isPending ? (
            <p className={styles.hint}>Загружаем задачи…</p>
          ) : visibleTasks.length === 0 ? (
            <p className={styles.hint}>
              Задач не нашлось. Беклог наполняет агент: он записывает задачи командой <code>backlog new</code>, пока
              работает над кодом.
            </p>
          ) : (
            <TaskTable
              tasks={visibleTasks}
              index={index}
              selectedId={selectedTask?.id}
              taskHref={(task) => `${prefix}/t/${task.id}?${search.toString()}`}
            />
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskPanel key={selectedTask.id} task={selectedTask} tasks={allTasks} index={index} onClose={() => navigate(withSearch(prefix))} />
      )}
    </main>
  );
}

function collectTags(tasks: readonly Task[]): string[] {
  return [...new Set(tasks.flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b, "ru"));
}
