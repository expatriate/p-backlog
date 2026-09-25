import { useEffect, useId, useMemo, useState } from "react";
import type { BatchAction, BatchRequest } from "../../core/api/contract";
import { compareIds } from "../../core/model/ids";
import { PRIORITIES, type Priority, type Task } from "../../core/model/types";
import { useBatchTasks } from "../app/queries";
import { requestErrorMessage } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { EpicTones } from "../ui/epic-tone";
import { MenuOption, MenuOptions } from "../ui/Menu";
import { Popover, useClosePopover } from "../ui/Popover";
import { epicChoices, type EpicChoice } from "./epic-choices";
import { EpicLabel } from "./EpicLabel";
import { partialBatchResult, type BatchResult } from "./BatchNotice";
import type { TaskSelection } from "./use-task-selection";
import styles from "./BulkActions.module.css";

export type BulkActionsProps = {
  selection: Pick<TaskSelection, "selected" | "hiddenCount" | "clear">;
  tasks: readonly Task[];
  tones: EpicTones;
  onDone: (result: BatchResult) => void;
};

export function BulkActions({ selection, tasks, tones, onDone }: BulkActionsProps) {
  const { list, app } = useMessages();
  const batch = useBatchTasks();
  const chosen = useMemo(() => tasks.filter((task) => selection.selected.has(task.id)).sort((a, b) => compareIds(a.id, b.id)), [tasks, selection.selected]);
  const shown = chosen.length > 0;

  const { isPending, reset } = batch;
  useEffect(() => {
    if (!shown && !isPending) reset();
  }, [shown, isPending, reset]);

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
    <section className={shown ? styles.panel : undefined} aria-label={shown ? list.selectionActions : undefined}>
      <p className={styles.count} role="status">
        {shown && list.selectedCount(chosen.length)}
        {shown && selection.hiddenCount > 0 && <span className={styles.hidden}> {list.hiddenByFilter(selection.hiddenCount)}</span>}
      </p>
      {shown && <SelectionActions chosen={chosen} tasks={tasks} tones={tones} busy={isPending} onRun={run} onClear={selection.clear} />}
      {shown && batch.error !== null && (
        <p className={styles.error} role="alert">
          {list.bulkFailed}: {requestErrorMessage(app, batch.error)}
        </p>
      )}
    </section>
  );
}

type SelectionActionsProps = {
  chosen: readonly Task[];
  tasks: readonly Task[];
  tones: EpicTones;
  busy: boolean;
  onRun: (action: BatchAction) => void;
  onClear: () => void;
};

function SelectionActions({ chosen, tasks, tones, busy, onRun, onClear }: SelectionActionsProps) {
  const { list, ui, core } = useMessages();
  const [closing, setClosing] = useState(false);

  return (
    <div className={styles.actions}>
      <Button busy={busy} onClick={() => setClosing(true)}>
        {list.closeAsObsolete}
      </Button>
      <Popover trigger={list.priority} placement="above" width="content" busy={busy}>
        <PriorityOptions onChoose={(priority) => onRun({ kind: "priority", priority })} />
      </Popover>
      <EpicAction chosen={chosen} tasks={tasks} tones={tones} busy={busy} onChoose={(epic) => onRun({ kind: "epic", epic })} />
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

type EpicActionProps = { chosen: readonly Task[]; tasks: readonly Task[]; tones: EpicTones; busy: boolean; onChoose: (epic: string | null) => void };

function EpicAction({ chosen, tasks, tones, busy, onChoose }: EpicActionProps) {
  const { list } = useMessages();
  const hintId = useId();
  const projectIds = new Set(chosen.map((task) => task.projectId));
  if (projectIds.size > 1) {
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
  const projectTasks = tasks.filter((task) => projectIds.has(task.projectId));
  return (
    <Popover trigger={list.epic} placement="above" width="content" busy={busy}>
      <AssignEpicOptions epics={epicChoices(projectTasks, tones).epics} onChoose={onChoose} />
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
