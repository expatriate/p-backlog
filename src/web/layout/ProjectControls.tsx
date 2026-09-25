import { useEffect, useRef, useState, type RefObject } from "react";
import type { Project } from "../../core/model/types";
import { useDeleteProject, useSetProjectActive } from "../app/queries";
import { requestErrorMessage } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import styles from "./ProjectControls.module.css";

export function ProjectCheckbox({ project }: { project: Project }) {
  const { layout } = useMessages();
  const setActive = useSetProjectActive();

  return (
    <>
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={project.active}
          aria-label={layout.checkboxLabel(project.name)}
          onChange={(event) => setActive.mutate({ id: project.id, active: event.target.checked })}
        />
      </label>
      <MutationError error={setActive.error} action={layout.setActiveFailed(setActive.variables?.active ?? false)} />
    </>
  );
}

export type ProjectDeleteButtonProps = { project: Project; taskCount: number | undefined; onDeleted: () => void };

export function ProjectDeleteButton({ project, taskCount, onDeleted }: ProjectDeleteButtonProps) {
  const { layout, ui } = useMessages();
  const [confirming, setConfirming] = useState(false);
  const deleteButton = useFocusAfterDialogCloses<HTMLButtonElement>(confirming);
  const deleteProject = useDeleteProject();

  return (
    <>
      <button ref={deleteButton} type="button" className={styles.delete} aria-label={layout.deleteButtonLabel(project.name)} title={layout.deleteButtonTitle} onClick={() => setConfirming(true)}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2h5.8l.6-8.2" />
        </svg>
      </button>
      <MutationError error={deleteProject.error} action={layout.deleteFailed} />
      <ConfirmDialog
        open={confirming}
        title={layout.deleteDialogTitle(project.name)}
        description={taskCount === undefined ? layout.deleteDialogDescriptionUnknown : layout.deleteDialogDescription(taskCount)}
        confirmWord={project.id}
        confirmWordLabel={layout.confirmWordLabel(project.id)}
        confirmLabel={layout.confirmLabel}
        cancelLabel={ui.cancel}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          deleteProject.mutate({ id: project.id, confirm: project.id }, { onSuccess: onDeleted });
        }}
      />
    </>
  );
}

function useFocusAfterDialogCloses<T extends HTMLElement>(dialogOpen: boolean): RefObject<T | null> {
  const target = useRef<T>(null);
  useEffect(() => {
    const element = target.current;
    if (!dialogOpen) return;
    return () => element?.focus();
  }, [dialogOpen]);
  return target;
}

function MutationError({ error, action }: { error: Error | null; action: string }) {
  const { app } = useMessages();
  if (error === null) return null;
  return (
    <span className={styles.error} role="alert">
      {action}: {requestErrorMessage(app, error)}
    </span>
  );
}
