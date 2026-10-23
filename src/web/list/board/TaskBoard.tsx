import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import { TASK_STATUSES, type Task, type TaskStatus } from "../../../core/model/types";
import { useAllTasks } from "../../app/all-tasks";
import { useTaskHref } from "../../app/use-task-href";
import { useMessages } from "../../i18n";
import { saveErrorText } from "../../task/use-task-saving";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { focusDropped } from "../../ui/focus-dropped";
import { Notice } from "../../ui/Notice";
import { PriorityLabel } from "../../ui/PriorityLabel";
import { StatusBadge } from "../../ui/StatusBadge";
import { TaskId } from "../../ui/TaskId";
import { useMediaQuery } from "../../ui/use-media-query";
import { NOTICE_LIFETIME_MS } from "../BatchNotice";
import { BlockedMarker } from "../BlockedMarker";
import { boardColumns, type BoardColumn, type PendingMoves } from "./board-columns";
import { useBoardMove } from "./use-board-move";
import styles from "./TaskBoard.module.css";

const MOUSE_ACTIVATION = { distance: 6 };
const TOUCH_ACTIVATION = { delay: 250, tolerance: 6 };
const KEYBOARD_CODES = { start: [KeyboardCode.Space], cancel: [KeyboardCode.Esc], end: [KeyboardCode.Space, KeyboardCode.Enter] };
const COLUMN_STEPS: Partial<Record<string, number>> = { [KeyboardCode.Left]: -1, [KeyboardCode.Right]: 1 };
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const TASK_ID_ATTRIBUTE = "data-task-id";

type BoardMoves = ReturnType<typeof useBoardMove>;

export function TaskBoard({ tasks, statuses, openedId }: { tasks: readonly Task[]; statuses: readonly TaskStatus[] | undefined; openedId: string | undefined }) {
  const { list } = useMessages();
  const moves = useBoardMove(tasks);
  const columns = useMemo(() => boardColumns(tasks, statuses, moves.pending), [tasks, statuses, moves.pending]);
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const [dragged, setDragged] = useState<Task | null>(null);
  const board = useRef<HTMLElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const clickAfterDrop = useClickAfterDrop();
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  useEscapeStaysWithDrag(dragged !== null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: MOUSE_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
    useSensor(KeyboardSensor, { keyboardCodes: KEYBOARD_CODES, coordinateGetter: columnKeyboardCoordinates }),
  );

  const announcements = useDragAnnouncements(byId, moves.pending);

  const start = ({ active }: DragStartEvent) => setDragged(byId.get(String(active.id)) ?? null);
  const drop = async ({ active, over }: DragEndEvent) => {
    setDragged(null);
    clickAfterDrop.suppress();
    const task = byId.get(String(active.id));
    const to = over === null ? undefined : columnStatus(over.id);
    if (task === undefined || to === undefined) return;
    if (await moves.move(task, to)) requestAnimationFrame(() => focusIfDropped(undoButton.current));
  };
  const undo = async () => {
    const restored = await moves.undo();
    if (restored !== null) requestAnimationFrame(() => focusIfDropped(board.current?.querySelector<HTMLElement>(`[${TASK_ID_ATTRIBUTE}="${restored}"]`)));
  };

  return (
    <section ref={board} className={styles.board} aria-label={list.board} onClickCapture={clickAfterDrop.onClickCapture}>
      <MoveNotice moves={moves} undoButton={undoButton} onUndo={() => void undo()} />
      <DndContext
        sensors={sensors}
        accessibility={{ announcements, screenReaderInstructions: { draggable: list.dragInstructions } }}
        onDragStart={start}
        onDragEnd={(event) => void drop(event)}
        onDragCancel={() => setDragged(null)}
      >
        <div className={styles.columns}>
          {columns.map((column) => (
            <BoardColumnView key={column.status} column={column} openedId={openedId} />
          ))}
        </div>
        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>{dragged === null ? null : <CardContent task={dragged} lifted />}</DragOverlay>
      </DndContext>
    </section>
  );
}

function MoveNotice({ moves: { lastMove, failure, undoing, dismiss }, undoButton, onUndo }: { moves: BoardMoves; undoButton: RefObject<HTMLButtonElement | null>; onUndo: () => void }) {
  const { list, core, app, task: taskMessages } = useMessages();
  const [focusInside, setFocusInside] = useState(false);
  useEffect(() => {
    if (lastMove === null || focusInside || undoing) return;
    const timer = setTimeout(dismiss, NOTICE_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [lastMove, focusInside, undoing, dismiss]);
  const leave = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false);
  };

  return (
    <Notice as="div" className={styles.notice} shown={lastMove !== null || failure !== null} role="status" onFocus={() => setFocusInside(true)} onBlur={leave}>
      {lastMove !== null && (
        <p className={styles.noticeLine}>
          {list.moved(lastMove.id, core.statusLabel(lastMove.to))}{" "}
          <Button ref={undoButton} busy={undoing} onClick={onUndo}>
            {list.undo}
          </Button>
        </p>
      )}
      {failure !== null && (
        <p className={cx(styles.noticeLine, styles.failure)} role="alert">
          {list.moveFailed(failure.id)}: {saveErrorText(failure.error, app, taskMessages)}
        </p>
      )}
    </Notice>
  );
}

function BoardColumnView({ column, openedId }: { column: BoardColumn; openedId: string | undefined }) {
  const { list } = useMessages();
  const headingId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  return (
    <section ref={setNodeRef} className={cx(styles.column, isOver && styles.over)} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.columnHeading}>
        <StatusBadge status={column.status} /> <span className={styles.count}>{list.columnCount(column.tasks.length)}</span>
      </h2>
      {column.tasks.length > 0 ? (
        <ul className={styles.cards}>
          {column.tasks.map((task) => (
            <BoardCard key={task.id} task={task} opened={task.id === openedId} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{column.filteredOut ? list.closedHidden : list.emptyColumn}</p>
      )}
    </section>
  );
}

function BoardCard({ task, opened }: { task: Task; opened: boolean }) {
  const taskHref = useTaskHref();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <li ref={setNodeRef} className={cx(styles.card, isDragging && styles.placeholder)}>
      <CardContent task={task}>
        <Link
          ref={setActivatorNodeRef}
          to={taskHref(task.id)}
          className={styles.title}
          aria-current={opened ? "true" : undefined}
          aria-describedby={attributes["aria-describedby"]}
          {...{ [TASK_ID_ATTRIBUTE]: task.id }}
          {...listeners}
        >
          {task.title}
        </Link>
      </CardContent>
    </li>
  );
}

function CardContent({ task, lifted = false, children }: { task: Task; lifted?: boolean; children?: ReactNode }) {
  const { index, tones } = useAllTasks();
  const epic = task.epic === undefined ? undefined : index.byId.get(task.epic);
  return (
    <div className={cx(styles.cardBody, "raised-surface", lifted && styles.lifted)}>
      <div className={styles.meta}>
        <TaskId id={task.id} tone={task.epic === undefined ? undefined : tones.get(task.epic)} />
        <PriorityLabel priority={task.priority} />
      </div>
      {children ?? <span className={styles.title}>{task.title}</span>}
      <div className={styles.meta}>
        <BlockedMarker task={task} className={styles.marker} />
        {epic !== undefined && (
          <span title={epic.title}>
            <TaskId id={epic.id} tone={tones.get(epic.id)} muted />
          </span>
        )}
      </div>
    </div>
  );
}

function useDragAnnouncements(byId: ReadonlyMap<string, Task>, pending: PendingMoves): Announcements {
  const { list, core } = useMessages();
  const movesToAnotherColumn = (taskId: string, columnId: UniqueIdentifier | undefined) => {
    const task = byId.get(taskId);
    const to = columnId === undefined ? undefined : columnStatus(columnId);
    return task !== undefined && to !== undefined && to !== (pending.get(taskId) ?? task.status);
  };
  const columnName = (id: UniqueIdentifier) => {
    const status = columnStatus(id);
    return status === undefined ? String(id) : core.statusLabel(status);
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => list.dragStarted(String(active.id)),
    onDragOver: ({ active, over }) => (over === null ? undefined : list.dragOver(String(active.id), columnName(over.id))),
    onDragEnd: ({ active, over }) => (movesToAnotherColumn(String(active.id), over?.id) ? undefined : list.dragStayed(String(active.id))),
    onDragCancel: ({ active }) => list.dragCancelled(String(active.id)),
  };
  return announcements;
}

function columnStatus(id: UniqueIdentifier): TaskStatus | undefined {
  return TASK_STATUSES.find((status) => status === id);
}

function focusIfDropped(target: HTMLElement | null | undefined): void {
  if (focusDropped()) target?.focus();
}

const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context: { collisionRect, droppableRects }, currentCoordinates }) => {
  const step = COLUMN_STEPS[event.code];
  if (step === undefined || collisionRect === null) return undefined;
  event.preventDefault();
  const columns = [...droppableRects.values()].sort((a, b) => a.left - b.left);
  const center = collisionRect.left + collisionRect.width / 2;
  const target = columns[columns.findLastIndex((rect) => rect.left <= center) + step];
  return target === undefined ? undefined : { x: target.left + (target.width - collisionRect.width) / 2, y: currentCoordinates.y };
};

function useEscapeStaysWithDrag(dragging: boolean): void {
  useEffect(() => {
    if (!dragging) return;
    const claimEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    };
    document.addEventListener("keydown", claimEscape, true);
    return () => document.removeEventListener("keydown", claimEscape, true);
  }, [dragging]);
}

function useClickAfterDrop() {
  const dropped = useRef(false);
  return {
    suppress: () => {
      dropped.current = true;
      requestAnimationFrame(() => {
        dropped.current = false;
      });
    },
    onClickCapture: (event: MouseEvent) => {
      if (dropped.current && event.target instanceof Element && event.target.closest("a") !== null) event.preventDefault();
    },
  };
}
