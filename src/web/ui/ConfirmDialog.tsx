import { useId, useLayoutEffect, useRef, useState, type FormEvent, type RefObject, type SyntheticEvent } from "react";
import { useMessages } from "../i18n";
import { Button } from "./Button";
import { useRestoreFocus } from "./use-restore-focus";
import styles from "./ConfirmDialog.module.css";

export type ConfirmDialogProps = {
  open: boolean;
  returnFocusTo: RefObject<HTMLElement | null>;
  title: string;
  description: string;
  fieldLabel: string;
  canConfirm: (typed: string) => boolean;
  confirmLabel: string;
  onConfirm: (typed: string) => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, returnFocusTo, onConfirm, onCancel, ...props }: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const restoreFocusOnClose = useRestoreFocus(returnFocusTo, dialog, open);
  if (!open) return null;

  const confirm = (typed: string) => {
    restoreFocusOnClose();
    onConfirm(typed);
  };
  const cancel = () => {
    restoreFocusOnClose();
    onCancel();
  };
  return <OpenDialog {...props} dialog={dialog} onConfirm={confirm} onCancel={cancel} />;
}

type OpenDialogProps = Omit<ConfirmDialogProps, "open" | "returnFocusTo"> & { dialog: RefObject<HTMLDialogElement | null> };

function OpenDialog({ dialog, title, description, fieldLabel, canConfirm, confirmLabel, onConfirm, onCancel }: OpenDialogProps) {
  const { ui } = useMessages();
  const titleId = useId();
  const [typed, setTyped] = useState("");

  const cancelIfStillClosed = (event: SyntheticEvent<HTMLDialogElement>) => {
    if (!event.currentTarget.open) onCancel();
  };

  const confirmIfAllowed = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canConfirm(typed)) onConfirm(typed);
  };

  useLayoutEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, [dialog]);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onCancel={onCancel} onClose={cancelIfStillClosed} onKeyDown={(event) => event.key === "Escape" && event.stopPropagation()}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <p className={styles.description}>{description}</p>
      <form onSubmit={confirmIfAllowed}>
        <label className={styles.field}>
          {fieldLabel}
          <input value={typed} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
        </label>
        <div className={styles.actions}>
          <Button onClick={onCancel}>{ui.cancel}</Button>
          <Button type="submit" variant="primary" unavailable={!canConfirm(typed)}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
