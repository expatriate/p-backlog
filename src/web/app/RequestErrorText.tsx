import { ApiError, isServerUnreachable, unreachableMessage } from "../api/client";
import styles from "./RequestErrorText.module.css";

export function RequestErrorText({ error }: { error: Error }) {
  if (isServerUnreachable(error)) {
    return (
      <>
        {unreachableMessage((command) => (
          <code key={command} className={styles.command}>
            {command}
          </code>
        ))}
      </>
    );
  }
  return <>{error instanceof ApiError && error.errors.length > 0 ? `Сервер вернул ошибку: ${error.message}` : error.message}</>;
}
