import { useEffect, useId, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams, type SetURLSearchParams } from "react-router";
import type { TasksResponse } from "../../core/api/contract";
import { listPath } from "../../core/api/web-paths";
import { AllTasksProvider } from "../app/all-tasks";
import { RequestFailure } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { PageHeading, PageHint, type PageHintState } from "../ui/Page";
import { useSettledValue } from "../ui/use-settled-value";
import { useDocumentTitle } from "../ui/use-document-title";
import { useStatusFocus } from "../ui/use-status-focus";
import { TaskPanel } from "../task/TaskPanel";
import type { ListMessages } from "./messages.ru";
import { actionsShortcutLabel, useKeyboardHints } from "./actions-shortcut";
import { ListFooter } from "./ListFooter";
import { LayoutSwitch } from "./LayoutSwitch";
import { Toolbar } from "./Toolbar";
import { TaskTable } from "./TaskTable";
import { useSeenTasks } from "./use-seen-tasks";
import { useSelectedTask } from "./use-selected-task";
import { useTaskSelection } from "./use-task-selection";
import { useTaskListView, type TaskListView } from "./use-task-list-view";
import { withTagToggled } from "./filter-toggle";
import { DEFAULT_FILTER, isDefaultFilter, pickSortKey, readLayout, readListParams, withLayout, writeListParams, type ListLayout, type ListParams } from "../app/list-params";
import { TaskBoard } from "./board/TaskBoard";
import styles from "./TaskListPage.module.css";

const COUNT_ANNOUNCE_DELAY_MS = 500;

export function TaskListPage() {
  const { list } = useMessages();
  const { projectId, taskId } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();

  const searchKey = search.toString();
  const params = useMemo(() => readListParams(new URLSearchParams(searchKey)), [searchKey]);
  const { layout, onBoard, setLayout } = useListLayout(searchKey, setSearch);
  const listing = useTaskListView(params, projectId);
  const { selectedTask, gone, missingTaskId } = useSelectedTask(listing.all.tasks, taskId, listing.tasksLoaded);
  const { isNew, markSeen } = useSeenTasks(listing.tasksLoaded ? listing.all.tasks : undefined);
  const visibleIds = useMemo(() => listing.table.tasks.map((task) => task.id), [listing.table.tasks]);
  const loadedIds = useMemo(() => new Set(listing.all.tasks.map((task) => task.id)), [listing.all.tasks]);
  const listAddress = listPath(projectId);
  const selection = useTaskSelection(visibleIds, listAddress, loadedIds);
  const keysHintId = useId();
  const keyboardHints = useKeyboardHints();

  useEffect(() => {
    if (selectedTask !== undefined) markSeen(selectedTask);
  }, [selectedTask, markSeen]);

  const viewTitle = viewTitleFor(list, listing.projectName, params.filter.onlyAutoClosed === true);
  useDocumentTitle(selectedTask === undefined ? list.docTitle(viewTitle) : list.taskDocTitle(selectedTask.id, selectedTask.title));

  const setParams = (next: ListParams) => setSearch(withLayout(writeListParams(next), layout), { replace: true });
  const heading = useRef<HTMLHeadingElement>(null);
  const statusFocus = useStatusFocus(listing.settled, heading);

  return (
    <AllTasksProvider value={listing.all}>
      <main id="content" tabIndex={-1} className={styles.page}>
        <div className={styles.list}>
          <PageHeading ref={heading} actions={<LayoutSwitch layout={layout} onChange={setLayout} />}>
            {viewTitle}
          </PageHeading>
          <Toolbar params={params} onChange={setParams} {...listing.filterChoices} />

          <MissingTaskNote taskId={missingTaskId} />

          <ParseErrorsNote parseErrors={listing.parseErrors} />

          {listing.content === "table" && keyboardHints && <KeysHint id={keysHintId} onBoard={onBoard} />}

          <div className={onBoard ? styles.boardWrap : styles.tableWrap}>
            <ListStatus view={listing} filter={params.filter} onFilterChange={(filter) => setParams({ ...params, filter })} statusFocus={statusFocus} />
            {onBoard && (listing.content === "table" || listing.content === "empty") && <TaskBoard tasks={listing.table.tasks} statuses={params.filter.statuses} openedId={selectedTask?.id} />}
            {listing.content === "table" && !onBoard && (
              <TaskTable
                {...listing.table}
                openedId={selectedTask?.id}
                onSort={(key) => setParams({ ...params, sort: pickSortKey(listing.table.sort, key) })}
                isNew={isNew}
                selectedTags={params.filter.tags ?? []}
                onToggleTag={(tag) => setParams(withTagToggled(params, tag))}
                selection={selection}
                describedBy={keyboardHints ? keysHintId : undefined}
              />
            )}
          </div>
          {!onBoard && <ListFooter key={listAddress} selection={selection} />}
        </div>

        {selectedTask && <TaskPanel key={selectedTask.id} task={selectedTask} onClose={() => void navigate({ pathname: listAddress, search: searchKey })} gone={gone} />}
      </main>
    </AllTasksProvider>
  );
}

function useListLayout(searchKey: string, setSearch: SetURLSearchParams) {
  const layout = readLayout(new URLSearchParams(searchKey));
  const setLayout = (next: ListLayout) => setSearch(withLayout(new URLSearchParams(searchKey), next), { replace: true });
  return { layout, onBoard: layout === "board", setLayout };
}

function MissingTaskNote({ taskId }: { taskId: string | undefined }) {
  const { list } = useMessages();
  return (
    <Notice className={styles.warning} shown={taskId !== undefined} role="status">
      {taskId !== undefined && list.missingTask(taskId)}
    </Notice>
  );
}

function KeysHint({ id, onBoard }: { id: string; onBoard: boolean }) {
  const { list } = useMessages();
  return (
    <p id={id} className={styles.keysHint}>
      {onBoard ? list.dragInstructions : list.selectionKeysHint(actionsShortcutLabel())}
    </p>
  );
}

function ParseErrorsNote({ parseErrors }: { parseErrors: TasksResponse["errors"] }) {
  const { list } = useMessages();
  return (
    <Notice as="div" className={styles.warning} shown={parseErrors.length > 0} role="status">
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
    </Notice>
  );
}

type ListStatusProps = {
  view: TaskListView;
  filter: ListParams["filter"];
  onFilterChange: (filter: ListParams["filter"]) => void;
  statusFocus: ReturnType<typeof useStatusFocus>;
};

function ListStatus({ view: { content, settled, request, empty, table }, filter, onFilterChange, statusFocus: { status, keepFocus } }: ListStatusProps) {
  const { list } = useMessages();
  const shownCount = table.tasks.length;
  const announcedCount = useSettledValue(settled ? shownCount : null, COUNT_ANNOUNCE_DELAY_MS) ?? shownCount;
  const retry = () => {
    keepFocus();
    void request.refetch();
  };
  const changeFilter = (next: ListParams["filter"]) => {
    keepFocus();
    onFilterChange(next);
  };
  return (
    <PageHint ref={status} state={listHintState(content, settled)}>
      {request.error !== null && <RequestFailure error={request.error} fetching={request.isFetching} onRetry={retry} />}
      {content === "loading" && <p>{list.loadingTasks}</p>}
      {content === "unknownProject" && <p>{list.unknownProject}</p>}
      {content === "empty" && <EmptyList {...empty} filter={filter} onFilterChange={changeFilter} />}
      {settled && <p>{list.taskCount(announcedCount)}</p>}
    </PageHint>
  );
}

function listHintState(content: TaskListView["content"], settled: boolean): PageHintState {
  if (settled) return "hidden";
  return content === "loading" ? "waiting" : "shown";
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
