import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import type { BatchAction, BatchRequest } from "../../core/api/contract";
import { compareIds } from "../../core/model/ids";
import { PRIORITIES, type Priority, type Task } from "../../core/model/types";
import { useBatchTasks } from "../app/queries";
import { ActionFailure } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { EpicTones } from "./epic-tone";
import { MenuOption, MenuOptions } from "../ui/Menu";
import { Popover, useClosePopover } from "../ui/Popover";
import { epicChoices, type EpicChoice } from "./epic-choices";
import { ACTIONS_SHORTCUT, actionsShortcutLabel, isActionsShortcut, useKeyboardHints } from "./actions-shortcut";
import { EpicLabel } from "./EpicLabel";
import { partialBatchResult, type BatchResult } from "./use-batch-result";
import type { TaskSelection } from "./use-task-selection";
import footer from "./FooterPanel.module.css";
import styles from "./BulkActions.module.css";

export type BulkActionsProps = {
  selection: Pick<TaskSelection, "selected" | "hiddenCount" | "clear">;
  tasks: readonly Task[];
  tones: EpicTones;
  onDone: (result: BatchResult) => void;
};

export function BulkActions({ selection, tasks, tones, onDone }: BulkActionsProps) {
  const { list } = useMessages();
  const firstAction = useRef<HTMLButtonElement>(null);
  const batch = useBatchTasks();
  const keyboardHints = useKeyboardHints();
  const chosen = useMemo(() => tasks.filter((task) => selection.selected.has(task.id)).sort((a, b) => compareIds(a.id, b.id)), [tasks, selection.selected]);
  const assignableEpics = useMemo(() => assignableEpicsOf(chosen, tasks, tones), [chosen, tasks, tones]);
  const shown = chosen.length > 0;

  const { isPending, reset } = batch;
  useEffect(() => {
    if (!shown && !isPending) reset();
  }, [shown, isPending, reset]);
  useEffect(() => {
    if (!shown) return;
    const jumpToActions = (event: KeyboardEvent) => {
      if (!isActionsShortcut(event) || isTextEntry(event.target)) return;
      event.preventDefault();
      firstAction.current?.focus();
    };
    document.addEventListener("keydown", jumpToActions);
    return () => document.removeEventListener("keydown", jumpToActions);
  }, [shown]);

  const run = (action: BatchAction) => {
    if (isPending) return;
    const request: BatchRequest = { tasks: chosen.map(({ id, version }) => ({ id, version })), action };
    batch.mutate(request, {
      onSuccess: (response) => onDone({ request, response }),
      onError: (error) => {
        const partial = partialBatchResult(request, error);
        if (partial) onDone(partial);
      },
    });
  };

  return (
    <section className={shown ? footer.panel : undefined} aria-label={shown ? list.selectionActions : undefined}>
      <p className={footer.headline} role="status">
        {shown && list.selectedCount(chosen.length)}
        {shown && selection.hiddenCount > 0 && <span className={styles.hidden}> {list.hiddenByFilter(selection.hiddenCount)}</span>}
      </p>
      {shown && <SelectionActions firstAction={firstAction} chosen={chosen} assignableEpics={assignableEpics} busy={isPending} onRun={run} onClear={selection.clear} />}
      {shown && keyboardHints && <p className={styles.hint}>{list.toActionsHint(actionsShortcutLabel())}</p>}
      {shown && <ActionFailure className={footer.error} action={list.bulkFailed} error={batch.error} />}
    </section>
  );
}

type SelectionActionsProps = {
  firstAction: RefObject<HTMLButtonElement | null>;
  chosen: readonly Task[];
  assignableEpics: EpicChoice[] | null;
  busy: boolean;
  onRun: (action: BatchAction) => void;
  onClear: () => void;
};

function SelectionActions({ firstAction, chosen, assignableEpics, busy, onRun, onClear }: SelectionActionsProps) {
  const { list, ui, core } = useMessages();
  const [closing, setClosing] = useState(false);

  return (
    <div className={styles.actions}>
      <Button ref={firstAction} busy={busy} aria-keyshortcuts={ACTIONS_SHORTCUT} onClick={() => setClosing(true)}>
        {list.closeAsObsolete}
      </Button>
      <Popover trigger={list.priority} placement="above" width="content" busy={busy}>
        <PriorityOptions onChoose={(priority) => onRun({ kind: "priority", priority })} />
      </Popover>
      <EpicAction epics={assignableEpics} busy={busy} onChoose={(epic) => onRun({ kind: "epic", epic })} />
      <Button onClick={onClear}>{list.clearSelection}</Button>
      <ConfirmDialog
        open={closing}
        title={list.closeDialogTitle(chosen.length)}
        description={list.closeDialogDescription(core.statusLabel("cancelled"))}
        fieldLabel={list.closeReason}
        canConfirm={(reason) => reason.trim() !== ""}
        confirmLabel={list.closeConfirm(chosen.length)}
        cancelLabel={ui.cancel}
        onCancel={() => setClosing(false)}
        onConfirm={(reason) => {
          setClosing(false);
          onRun({ kind: "close", reason: reason.trim() });
        }}
      />
    </div>
  );
}

function PriorityOptions({ onChoose }: { onChoose: (priority: Priority) => void }) {
  const { core } = useMessages();
  const closePopover = useClosePopover();
  return (
    <MenuOptions>
      {PRIORITIES.map((priority, index) => (
        <MenuOption
          key={priority}
          initialFocus={index === 0}
          onChoose={() => {
            closePopover();
            onChoose(priority);
          }}
        >
          {core.priorityLabel(priority)}
        </MenuOption>
      ))}
    </MenuOptions>
  );
}

function assignableEpicsOf(chosen: readonly Task[], tasks: readonly Task[], tones: EpicTones): EpicChoice[] | null {
  const projectIds = new Set(chosen.map((task) => task.projectId));
  if (projectIds.size > 1) return null;
  return epicChoices(
    tasks.filter((task) => projectIds.has(task.projectId)),
    tones,
  ).epics;
}

type EpicActionProps = { epics: EpicChoice[] | null; busy: boolean; onChoose: (epic: string | null) => void };

function EpicAction({ epics, busy, onChoose }: EpicActionProps) {
  const { list } = useMessages();
  const hintId = useId();
  if (epics === null) {
    return (
      <span className={styles.unavailable}>
        <Button aria-disabled="true" aria-describedby={hintId}>
          {list.epic}
        </Button>
        <span id={hintId} className={styles.hint}>
          {list.mixedProjects}
        </span>
      </span>
    );
  }
  return (
    <Popover trigger={list.epic} placement="above" width="content" busy={busy}>
      <AssignEpicOptions epics={epics} onChoose={onChoose} />
    </Popover>
  );
}

function AssignEpicOptions({ epics, onChoose }: { epics: EpicChoice[]; onChoose: (epic: string | null) => void }) {
  const { list } = useMessages();
  const closePopover = useClosePopover();
  const choose = (epic: string | null) => {
    closePopover();
    onChoose(epic);
  };
  return (
    <MenuOptions>
      <MenuOption initialFocus onChoose={() => choose(null)}>
        {list.removeFromEpic}
      </MenuOption>
      {epics.map((epic) => (
        <MenuOption key={epic.id} tone={epic.tone} onChoose={() => choose(epic.id)}>
          <EpicLabel id={epic.id} title={epic.title} count={epic.taskCount} />
        </MenuOption>
      ))}
    </MenuOptions>
  );
}

function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches("input:not([type=checkbox]), textarea, select, [contenteditable]");
}
