import { useId } from "react";
import styles from "./FieldError.module.css";

type FieldErrorState = { id: string; message: string | null };

export function useFieldError(message: string | null) {
  const id = useId();
  const error: FieldErrorState = { id, message };
  return { error, inputProps: { "aria-invalid": message !== null, "aria-describedby": message === null ? undefined : id } };
}

export function FieldError({ id, message }: FieldErrorState) {
  if (message === null) return null;
  return (
    <span id={id} className={styles.error} role="alert">
      {message}
    </span>
  );
}
