import { ApiError, isServerUnreachable, unreachableMessage } from "../api/client";

export function RequestErrorText({ error }: { error: Error }) {
  if (isServerUnreachable(error)) {
    return (
      <>
        {unreachableMessage((command) => (
          <code key={command} className="inline-code">
            {command}
          </code>
        ))}
      </>
    );
  }
  return <>{error instanceof ApiError && error.errors.length > 0 ? `Сервер вернул ошибку: ${error.message}` : error.message}</>;
}
