import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import type { TasksResponse } from "../../core/api/contract";
import { listPath, taskPath } from "../app/paths";
import { RequestFailure } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { toneOf } from "../ui/epic-tone";
import { useSettledValue } from "../ui/use-settled-value";
import { useStatusFocus } from "../ui/use-status-focus";
import { TaskPanel } from "../task/TaskPanel";
import type { ListMessages } from "./messages.ru";
import { Toolbar } from "./Toolbar";
import { TaskTable } from "./TaskTable";
import { useSeenTasks } from "./use-seen-tasks";
import { useSelectedTask } from "./use-selected-task";
import { useTaskListView, type ListContent } from "./use-task-list-view";
import { toggledTags } from "./tag-filter";
import { DEFAULT_FILTER, isDefaultFilter, pickSortKey, readListParams, writeListParams, type ListParams } from "./list-params";
import styles from "./TaskListPage.module.css";

const COUNT_ANNOUNCE_DELAY_MS = 500;

export function TaskListPage() {
  const { list } = useMessages();
  const { projectId, taskId } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();

  const searchKey = search.toString();
  const params = useMemo(() => readListParams(new URLSearchParams(searchKey)), [searchKey]);
  const view = useTaskListView(params, projectId);
  const { isNew, markSeen } = useSeenTasks(view.loaded ? view.allTasks : undefined);
  const { selectedTask, gone, missingTaskId } = useSelectedTask(view.allTasks, taskId, view.loaded);

  const viewTitle = viewTitleFor(list, view.projectName, params.filter.onlyAutoClosed === true);
  useEffect(() => {
    document.title = selectedTask === undefined ? list.docTitle(viewTitle) : list.taskDocTitle(selectedTask.id, selectedTask.title);
  }, [list, viewTitle, selectedTask]);
  useEffect(() => {
    if (selectedTask !== undefined) markSeen(selectedTask);
  }, [selectedTask, markSeen]);

  const setParams = (next: ListParams) => setSearch(writeListParams(next), { replace: true });
  const taskHref = (id: string) => ({ pathname: taskPath(projectId, id), search: searchKey });
  const heading = useRef<HTMLHeadingElement>(null);
  const { status, keepFocus } = useStatusFocus(view.settled, heading);

  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      <div className={styles.list}>
        <h1 ref={heading} tabIndex={-1} className={styles.heading}>
          {viewTitle}
        </h1>
        <Toolbar params={params} onChange={setParams} tags={view.tags} epicChoices={view.epicFilterChoices} autoClosedCount={view.autoClosedCount} />

        <p className={missingTaskId !== undefined ? styles.warning : "visually-hidden"} role="status">
          {missingTaskId !== undefined && list.missingTask(missingTaskId)}
        </p>

        <ParseErrorsNote list={list} parseErrors={view.parseErrors} />

        <div className={styles.tableWrap}>
          <ListStatus
            list={list}
            statusRef={status}
            content={view.content}
            settled={view.settled}
            shownCount={view.settled ? view.visibleTasks.length : null}
            request={view.request}
            onRetry={() => {
              keepFocus();
              void view.request.refetch();
            }}
            empty={
              <EmptyList
                list={list}
                hasTasks={view.scopedTasks.length > 0}
                hiddenOpen={view.hiddenOpen}
                filter={params.filter}
                onFilterChange={(filter) => {
                  keepFocus();
                  setParams({ ...params, filter });
                }}
              />
            }
          />
          {view.content === "table" && (
            <TaskTable
              tasks={view.visibleTasks}
              index={view.index}
              selectedId={selectedTask?.id}
              sort={view.sort}
              dateColumn={view.dateColumn}
              onSort={(key) => setParams({ ...params, sort: pickSortKey(view.sort, key) })}
              taskHref={taskHref}
              tones={view.tones}
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
          tasks={view.allTasks}
          index={view.index}
          taskHref={taskHref}
          onClose={() => void navigate({ pathname: listPath(projectId), search: searchKey })}
          tone={toneOf(selectedTask, view.tones)}
          gone={gone}
        />
      )}
    </main>
  );
}

function ParseErrorsNote({ list, parseErrors }: { list: ListMessages; parseErrors: TasksResponse["errors"] }) {
  return (
    <div className={parseErrors.length > 0 ? styles.warning : "visually-hidden"} role="status">
      {parseErrors.length > 0 && (
        <>
          <strong>{list.parseErrorsTitle}</strong>
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
  );
}

type ListStatusProps = {
  list: ListMessages;
  statusRef: RefObject<HTMLDivElement | null>;
  content: ListContent;
  settled: boolean;
  shownCount: number | null;
  request: { error: Error | null; isFetching: boolean };
  onRetry: () => void;
  empty: ReactNode;
};

function ListStatus({ list, statusRef, content, settled, shownCount, request, onRetry, empty }: ListStatusProps) {
  const announcedCount = useSettledValue(shownCount, COUNT_ANNOUNCE_DELAY_MS) ?? shownCount ?? 0;
  return (
    <div ref={statusRef} tabIndex={-1} role="status" className={settled ? "visually-hidden" : styles.hint}>
      {request.error !== null && <RequestFailure error={request.error} fetching={request.isFetching} onRetry={onRetry} />}
      {content === "loading" && <p>{list.loadingTasks}</p>}
      {content === "unknownProject" && <p>{list.unknownProject}</p>}
      {content === "empty" && empty}
      {settled && <p>{list.taskCount(announcedCount)}</p>}
    </div>
  );
}

function EmptyList({
  list,
  hasTasks,
  hiddenOpen,
  filter,
  onFilterChange,
}: {
  list: ListMessages;
  hasTasks: boolean;
  hiddenOpen: number;
  filter: ListParams["filter"];
  onFilterChange: (filter: ListParams["filter"]) => void;
}) {
  const hiddenNote = list.hiddenOpenNote(hiddenOpen);
  if (!hasTasks) {
    if (hiddenOpen > 0) return <p>{list.noTasksInScope(hiddenNote)}</p>;
    return <p>{list.noTasksYet((text) => <code key={text} className="inline-code">{text}</code>)}</p>;
  }
  if (isDefaultFilter(filter)) {
    return (
      <>
        <p>{hiddenOpen > 0 ? list.noOpenTasksInScope(hiddenNote) : list.noOpenTasks}</p>
        <Button onClick={() => onFilterChange({ statuses: undefined })}>{list.showAllStatuses}</Button>
      </>
    );
  }
  return (
    <>
      <p>{list.noMatches}</p>
      <Button onClick={() => onFilterChange(DEFAULT_FILTER)}>{list.resetFilters}</Button>
    </>
  );
}

function viewTitleFor(list: ListMessages, projectName: string | undefined, onlyAutoClosed: boolean): string {
  if (onlyAutoClosed) return projectName === undefined ? list.autoClosed : list.autoClosedInProject(projectName);
  return projectName ?? list.projects;
}
