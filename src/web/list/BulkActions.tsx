import { useId, useMemo, useState } from "react";
import type { BatchAction, BatchRequest, BatchResponse } from "../../core/api/contract";
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
import { EpicChoiceLabel } from "./EpicPicker";
import type { TaskSelection } from "./use-task-selection";
import styles from "./BulkActions.module.css";

export type BulkActionsProps = {
  selection: Pick<TaskSelection, "selected" | "hiddenCount" | "clear">;
  tasks: readonly Task[];
  tones: EpicTones;
  onDone: (response: BatchResponse, request: BatchRequest) => void;
};

export function BulkActions({ selection, tasks, tones, onDone }: BulkActionsProps) {
  const { list, ui, app, core } = useMessages();
  const batch = useBatchTasks();
  const [closing, setClosing] = useState(false);
  const chosen = useMemo(() => tasks.filter((task) => selection.selected.has(task.id)).sort((a, b) => compareIds(a.id, b.id)), [tasks, selection.selected]);
  if (chosen.length === 0) return null;

  const run = (action: BatchAction) => {
    if (batch.isPending) return;
    const request: BatchRequest = { tasks: chosen.map(({ id, version }) => ({ id, version })), action };
    batch.mutate(request, { onSuccess: (response) => onDone(response, request) });
  };

  return (
    <section className={styles.panel} aria-label={list.selectionActions}>
      <p className={styles.count}>
        {list.selectedCount(chosen.length)}
        {selection.hiddenCount > 0 && <span className={styles.hidden}> {list.hiddenByFilter(selection.hiddenCount)}</span>}
      </p>
      <div className={styles.actions}>
        <Button busy={batch.isPending} onClick={() => setClosing(true)}>
          {list.closeAsObsolete}
        </Button>
        <Popover trigger={list.priority} panelClassName={styles.menu}>
          <PriorityOptions onChoose={(priority) => run({ kind: "priority", priority })} />
        </Popover>
        <EpicAction chosen={chosen} tasks={tasks} tones={tones} onChoose={(epic) => run({ kind: "epic", epic })} />
        <Button onClick={selection.clear}>{list.clearSelection}</Button>
      </div>
      {batch.error !== null && (
        <p className={styles.error} role="alert">
          {list.bulkFailed}: {requestErrorMessage(app, batch.error)}
        </p>
      )}
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
          run({ kind: "close", reason: reason.trim() });
        }}
      />
    </section>
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

type EpicActionProps = { chosen: readonly Task[]; tasks: readonly Task[]; tones: EpicTones; onChoose: (epic: string | null) => void };

function EpicAction({ chosen, tasks, tones, onChoose }: EpicActionProps) {
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
    <Popover trigger={list.epic} panelClassName={styles.menu}>
      <EpicOptions epics={epicChoices(projectTasks, tones).epics} onChoose={onChoose} />
    </Popover>
  );
}

function EpicOptions({ epics, onChoose }: { epics: EpicChoice[]; onChoose: (epic: string | null) => void }) {
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
          <EpicChoiceLabel epic={epic} />
        </MenuOption>
      ))}
    </MenuOptions>
  );
}
