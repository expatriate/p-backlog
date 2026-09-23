import { useMessages } from "../i18n";
import { ApiError, isServerUnreachable } from "../api/client";
import type { AppMessages } from "./messages.ru";

export function RequestErrorText({ error }: { error: Error }) {
  const { app } = useMessages();
  if (isServerUnreachable(error)) {
    return (
      <>
        {app.unreachableMessage((command) => (
          <code key={command} className="inline-code">
            {command}
          </code>
        ))}
      </>
    );
  }
  if (error instanceof ApiError) return <>{error.errors.length > 0 ? app.serverErrorPrefixed(error.message) : app.serverStatusError(error.status)}</>;
  return <>{error.message}</>;
}

export function requestErrorMessage(app: AppMessages, error: Error): string {
  if (isServerUnreachable(error)) return app.unreachableMessage((text: string) => text).join("");
  if (error instanceof ApiError) return error.errors.length > 0 ? error.message : app.serverStatusError(error.status);
  return error.message;
}
