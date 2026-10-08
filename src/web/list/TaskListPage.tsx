import { useId, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import type { TasksResponse } from "../../core/api/contract";
import { listPath } from "../../core/api/web-paths";
import { AllTasksProvider } from "../app/all-tasks";
import { RequestFailure } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { toneOf } from "./epic-tone";
import { useSettledValue } from "../ui/use-settled-value";
import { useDocumentTitle } from "../ui/use-document-title";
import { useStatusFocus } from "../ui/use-status-focus";
import { TaskPanel } from "../task/TaskPanel";
import type { ListMessages } from "./messages.ru";
import { actionsShortcutLabel, useKeyboardHints } from "./actions-shortcut";
import { ListFooter } from "./ListFooter";
import { Toolbar } from "./Toolbar";
import { TaskTable } from "./TaskTable";
import { useSeenTasks } from "./use-seen-tasks";
import { useSelectedTask } from "./use-selected-task";
import { useTaskSelection } from "./use-task-selection";
import { useTaskListView, type ListContent } from "./use-task-list-view";
import { withTagToggled } from "./filter-toggle";
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
  const { selectedTask, gone, missingTaskId } = useSelectedTask(view.all.tasks, taskId, view.tasksLoaded);
  const { isNew } = useSeenTasks(view.tasksLoaded ? view.all.tasks : undefined, selectedTask);
  const visibleIds = useMemo(() => view.table.tasks.map((task) => task.id), [view.table.tasks]);
  const loadedIds = useMemo(() => new Set(view.all.tasks.map((task) => task.id)), [view.all.tasks]);
  const selection = useTaskSelection(visibleIds, projectId ?? "", loadedIds);
  const keysHintId = useId();
  const keyboardHints = useKeyboardHints();

  const viewTitle = viewTitleFor(list, view.projectName, params.filter.onlyAutoClosed === true);
  useDocumentTitle(selectedTask === undefined ? list.docTitle(viewTitle) : list.taskDocTitle(selectedTask.id, selectedTask.title));

  const setParams = (next: ListParams) => setSearch(writeListParams(next), { replace: true });
  const heading = useRef<HTMLHeadingElement>(null);
  const { status, keepFocus } = useStatusFocus(view.settled, heading);

  return (
    <AllTasksProvider value={view.all}>
      <main id="content" tabIndex={-1} className={styles.page}>
        <div className={styles.list}>
          <h1 ref={heading} tabIndex={-1} className={styles.heading}>
            {viewTitle}
          </h1>
          <Toolbar params={params} onChange={setParams} {...view.filterChoices} />

          <p className={missingTaskId !== undefined ? styles.warning : "visually-hidden"} role="status">
            {missingTaskId !== undefined && list.missingTask(missingTaskId)}
          </p>

          <ParseErrorsNote parseErrors={view.parseErrors} />

          {view.content === "table" && keyboardHints && (
            <p id={keysHintId} className={styles.keysHint}>
              {list.selectionKeysHint(actionsShortcutLabel())}
            </p>
          )}

          <div className={styles.tableWrap}>
            <ListStatus
              statusRef={status}
              content={view.content}
              shownCount={view.settled ? view.table.tasks.length : null}
              request={view.request}
              onRetry={() => {
                keepFocus();
                void view.request.refetch();
              }}
              empty={
                <EmptyList
                  {...view.empty}
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
                {...view.table}
                openedId={selectedTask?.id}
                onSort={(key) => setParams({ ...params, sort: pickSortKey(view.table.sort, key) })}
                isNew={isNew}
                selectedTags={params.filter.tags ?? []}
                onToggleTag={(tag) => setParams(withTagToggled(params, tag))}
                selection={selection}
                describedBy={keyboardHints ? keysHintId : undefined}
              />
            )}
          </div>
          <ListFooter key={projectId ?? ""} selection={selection} />
        </div>

        {selectedTask && (
          <TaskPanel key={selectedTask.id} task={selectedTask} onClose={() => void navigate({ pathname: listPath(projectId), search: searchKey })} tone={toneOf(selectedTask, view.all.tones)} gone={gone} />
        )}
      </main>
    </AllTasksProvider>
  );
}

function ParseErrorsNote({ parseErrors }: { parseErrors: TasksResponse["errors"] }) {
  const { list } = useMessages();
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
  statusRef: RefObject<HTMLDivElement | null>;
  content: ListContent;
  shownCount: number | null;
  request: { error: Error | null; isFetching: boolean };
  onRetry: () => void;
  empty: ReactNode;
};

function ListStatus({ statusRef, content, shownCount, request, onRetry, empty }: ListStatusProps) {
  const { list } = useMessages();
  const settled = shownCount !== null;
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

function EmptyList({ hasTasks, hiddenOpen, filter, onFilterChange }: { hasTasks: boolean; hiddenOpen: number; filter: ListParams["filter"]; onFilterChange: (filter: ListParams["filter"]) => void }) {
  const { list } = useMessages();
  const hiddenNote = list.hiddenOpenNote(hiddenOpen);
  if (!hasTasks) {
    if (hiddenOpen > 0) return <p>{list.noTasksInScope(hiddenNote)}</p>;
    return (
      <p>
        {list.noTasksYet((text) => (
          <code key={text} className="inline-code">
            {text}
          </code>
        ))}
      </p>
    );
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
