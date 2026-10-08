import { useId, useLayoutEffect, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { useMessages } from "../i18n";
import { Button } from "./Button";
import styles from "./ConfirmDialog.module.css";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  fieldLabel: string;
  canConfirm: (typed: string) => boolean;
  confirmLabel: string;
  onConfirm: (typed: string) => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, ...props }: ConfirmDialogProps) {
  return open ? <OpenDialog {...props} /> : null;
}

function OpenDialog({ title, description, fieldLabel, canConfirm, confirmLabel, onConfirm, onCancel }: Omit<ConfirmDialogProps, "open">) {
  const { ui } = useMessages();
  const dialog = useRef<HTMLDialogElement>(null);
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
  }, []);

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
