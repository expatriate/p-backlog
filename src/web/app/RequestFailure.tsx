import { useMessages } from "../i18n";
import { ApiError, isServerUnreachable } from "../api/client";
import { RetryButton } from "../ui/RetryButton";
import type { AppMessages } from "./messages.ru";

const SERVER_FAILURE_STATUS = 500;

function RequestErrorText({ error }: { error: Error }) {
  const { app } = useMessages();
  const command = (text: string) => (
    <code key={text} className="inline-code">
      {text}
    </code>
  );
  return <>{requestErrorParts(app, error, command)}</>;
}

export function RequestFailure({ error, fetching, onRetry }: { error: Error; fetching: boolean; onRetry: () => void }) {
  return (
    <>
      <p>
        <RequestErrorText error={error} />
      </p>
      <RetryButton fetching={fetching} onRetry={onRetry} />
    </>
  );
}

export function requestErrorMessage(app: AppMessages, error: Error): string {
  return requestErrorParts(app, error, (text) => text).join("");
}

function requestErrorParts<T>(app: AppMessages, error: Error, command: (text: string) => T): Array<string | T> {
  if (isServerUnreachable(error)) return app.unreachableMessage(command);
  if (!(error instanceof ApiError)) return [error.message];
  if (error.errors.length === 0) return [app.serverStatusError(error.status)];
  return [error.status >= SERVER_FAILURE_STATUS ? app.serverErrorPrefixed(error.message) : error.message];
}
