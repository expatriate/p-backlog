import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./Button";
import styles from "./ConfirmDialog.module.css";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmWord: string;
  confirmWordLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, ...props }: ConfirmDialogProps) {
  return open ? <OpenDialog {...props} /> : null;
}

function OpenDialog({ title, description, confirmWord, confirmWordLabel, confirmLabel, onConfirm, onCancel }: Omit<ConfirmDialogProps, "open">) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={onCancel}
      onClose={onCancel}
      onKeyDown={(event) => event.key === "Escape" && event.stopPropagation()}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <p className={styles.description}>{description}</p>
      <label className={styles.field}>
        {confirmWordLabel}
        <input className={styles.input} value={typed} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
      </label>
      <div className={styles.actions}>
        <Button onClick={onCancel}>Отмена</Button>
        <Button variant="primary" disabled={typed !== confirmWord} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
