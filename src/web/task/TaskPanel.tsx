import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatDateTime } from "../../core/i18n/format";
import { toggleChecklistItem } from "../../core/model/checklist";
import { dependentTasks, epicChildren, isClosed, relatedTasks, taskProgress, type BacklogIndex } from "../../core/model/graph";
import { parseId } from "../../core/model/ids";
import { taskWarnings } from "../../core/model/integrity";
import type { Task } from "../../core/model/types";
import { useAllTasks } from "../app/all-tasks";
import type { TaskChange } from "../app/queries";
import { useLanguage, useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { DeletionCountdown } from "../ui/Deletion";
import { toneOf } from "../ui/epic-tone";
import { Notice } from "../ui/Notice";
import { ProgressBar } from "../ui/ProgressBar";
import type { Draft } from "../ui/use-draft";
import { useLeaveGuard } from "../ui/use-leave-guard";
import { SidePanel } from "../ui/SidePanel";
import { StatusBadge } from "../ui/StatusBadge";
import { TaskId } from "../ui/TaskId";
import { useNow } from "../ui/use-now";
import { TaskBody } from "./TaskBody";
import { TaskFields } from "./TaskFields";
import { TaskRef } from "./TaskRef";
import { TaskOptions, TaskRefs, type TaskRefsProps } from "./TaskRefs";
import { useFieldDrafts } from "./use-field-drafts";
import { useSaveNote, useTaskSaving, type RefsSaveResult } from "./use-task-saving";
import { useScrollSpaceFor } from "../ui/use-scroll-space";
import styles from "./TaskPanel.module.css";

export type TaskPanelProps = {
  task: Task;
  onClose: () => void;
  gone: boolean;
};

const TASK_LIST_ID = "task-ids";
const EPIC_LIST_ID = "epic-ids";

export function TaskPanel({ task, onClose, gone }: TaskPanelProps) {
  const { core, task: taskMessages } = useMessages();
  const { tasks, index, unparsedTaskIds, tones } = useAllTasks();
  const saver = useTaskSaving(task);
  const fields = useFieldDrafts(task);
  const bodyEditing = saver.body.editor.phase !== "closed";
  const refDrafts = useRefDrafts();
  useLeaveGuard(
    { unsaved: bodyEditing || fields.unsaved || refDrafts.unsaved, saving: saver.saving, saveFailed: saver.saveFailed },
    {
      ifUnsaved: bodyEditing ? taskMessages.leaveWithDraft : taskMessages.leaveWithFieldEdits,
      ifStillSaving: taskMessages.leaveWhileSaving,
    },
  );
  const goneAlert = unparsedTaskIds.has(task.id) ? core.taskNotLoaded(task.id) : taskMessages.taskGone(task.id);
  const cardAlerts = gone ? [goneAlert] : distinctTexts([...saver.alerts, ...fields.alerts]);
  const saveNote = useSaveNote(saver.lastSave);
  const refOptions = useMemo(
    () => (
      <>
        <TaskOptions id={TASK_LIST_ID} tasks={tasks.filter((other) => other.id !== task.id)} />
        <TaskOptions id={EPIC_LIST_ID} tasks={tasks.filter((candidate) => candidate.type === "epic")} />
      </>
    ),
    [tasks, task.id],
  );
  const idPrefix = parseId(task.id)?.prefix ?? task.id;
  const warnings = taskWarnings(task, index, unparsedTaskIds).map(core.problem);
  const children = task.type === "epic" ? epicChildren(task, index) : [];

  return (
    <SidePanel label={taskMessages.cardLabel(task.id)} heading={<TaskId id={task.id} tone={toneOf(task, tones)} />} onClose={onClose} className={cardAlerts.length > 0 ? styles.alertsPinned : undefined}>
      <TitleField draft={fields.title} label={taskMessages.title} onSave={(next) => saver.apply({ title: next })} />

      <TaskFields task={task} epicListId={EPIC_LIST_ID} onChange={saver.apply} tags={fields.tags} epic={fields.epic} />

      <TaskMeta task={task} index={index} />

      <CardStatus saveNote={saveNote} alerts={cardAlerts} />

      {isClosed(task.status) && <ClosureNote task={task} onRestore={() => void saver.apply({ status: "backlog" })} />}
      {warnings.length > 0 && (
        <Notice as="ul" className={styles.warnings}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </Notice>
      )}

      <TaskBody
        body={task.body}
        editor={saver.body.editor}
        onEdit={saver.body.edit}
        onCloseEditor={saver.body.close}
        onToggleLine={(line) => void saver.save((fresh) => ({ body: toggleChecklistItem(fresh.body, line) }))}
        onSave={saver.body.save}
      />

      <EditableRefs task={task} idPrefix={idPrefix} drafts={refDrafts} saveRefs={saver.saveRefs} />

      <ReadonlyRefs label={taskMessages.dependentsLabel} tasks={dependentTasks(task, index)} />
      <ReadonlyRefs label={taskMessages.referrersLabel} tasks={relatedTasks(task, index).filter((other) => !task.related.includes(other.id))} />
      <ReadonlyRefs label={taskMessages.epicChildrenLabel} tasks={children} />

      {refOptions}
    </SidePanel>
  );
}

type RefDraft = Pick<TaskRefsProps, "draft" | "setDraft">;

function useRefDrafts() {
  const [blockedBy, setBlockedBy] = useState("");
  const [related, setRelated] = useState("");
  return {
    blockedBy: { draft: blockedBy, setDraft: setBlockedBy },
    related: { draft: related, setDraft: setRelated },
    unsaved: [blockedBy, related].some((typed) => typed.trim() !== ""),
  };
}

type EditableRefsProps = {
  task: Task;
  idPrefix: string;
  drafts: { blockedBy: RefDraft; related: RefDraft };
  saveRefs: (change: TaskChange) => Promise<RefsSaveResult>;
};

function EditableRefs({ task, idPrefix, drafts, saveRefs }: EditableRefsProps) {
  const { task: taskMessages } = useMessages();
  return (
    <>
      <TaskRefs
        label={taskMessages.blockedByLabel}
        ids={task.blockedBy}
        listId={TASK_LIST_ID}
        idPrefix={idPrefix}
        {...drafts.blockedBy}
        onChange={(update) => saveRefs((fresh) => ({ blockedBy: update(fresh.blockedBy) }))}
      />
      <TaskRefs
        label={taskMessages.relatedLabel}
        ids={task.related}
        listId={TASK_LIST_ID}
        idPrefix={idPrefix}
        {...drafts.related}
        onChange={(update) => saveRefs((fresh) => ({ related: update(fresh.related) }))}
      />
    </>
  );
}

function distinctTexts(texts: (string | null)[]): string[] {
  return [...new Set(texts.filter((text) => text !== null))];
}

function TaskMeta({ task, index }: { task: Task; index: BacklogIndex }) {
  const language = useLanguage();
  const { task: taskMessages } = useMessages();
  return (
    <div className={styles.meta}>
      <StatusBadge status={task.status} />
      <ProgressBar progress={taskProgress(task, index)} />
      <span>
        {taskMessages.createdLabel} {formatDateTime(language, task.created)}
      </span>
      {task.source && <span className={styles.source}>{task.source}</span>}
    </div>
  );
}

function ClosureNote({ task, onRestore }: { task: Task; onRestore: () => void }) {
  const language = useLanguage();
  const { core, task: taskMessages } = useMessages();
  const now = useNow();
  const recordedReason = task.reason?.trim() ?? "";
  return (
    <div className={styles.closure}>
      <p>
        {task.closed === undefined ? taskMessages.closedWithoutDate : `${taskMessages.closedLabel} ${formatDateTime(language, task.closed)}`}
        {task.resolution !== undefined && ` · ${core.resolutionLabel(task.resolution)} — ${recordedReason === "" ? taskMessages.reasonNotRecorded : recordedReason}`}
      </p>
      <DeletionCountdown task={task} now={now} />
      <Button className={styles.restore} onClick={onRestore}>
        {taskMessages.restoreToBacklog}
      </Button>
    </div>
  );
}

function CardStatus({ saveNote, alerts }: { saveNote: string; alerts: readonly string[] }) {
  const pinned = useRef<HTMLDivElement>(null);
  useScrollSpaceFor(pinned, "--card-status-height");
  return (
    <div ref={pinned} className={styles.pinned}>
      <p className={styles.saving} role="status">
        {saveNote}
      </p>
      {alerts.map((text) => (
        <p key={text} className={styles.alert} role="alert">
          {text}
        </p>
      ))}
    </div>
  );
}

type TitleFieldProps = { draft: Draft<HTMLTextAreaElement>; label: string; onSave: (title: string) => Promise<boolean> };

function TitleField({ draft: title, label, onSave }: TitleFieldProps) {
  const { ref: titleRef } = title;
  useLayoutEffect(() => {
    const field = titleRef.current;
    if (!field) return;
    const fit = () => {
      const borders = field.offsetHeight - field.clientHeight;
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight + borders}px`;
    };
    fit();
    const box = field.parentElement;
    if (!box) return;
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [title.value, titleRef]);

  return (
    <textarea
      ref={titleRef}
      className={styles.title}
      rows={1}
      value={title.value}
      aria-label={label}
      onChange={(event) => title.set(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (title.canonical === "") title.reset();
        else title.commit(onSave);
      }}
    />
  );
}

function ReadonlyRefs({ label, tasks }: { label: string; tasks: readonly Task[] }) {
  if (tasks.length === 0) return null;
  return (
    <section className={styles.readonlyRefs} aria-label={label}>
      <h2>{label}</h2>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <TaskRef id={task.id} muted={isClosed(task.status)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
