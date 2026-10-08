import { useMessages } from "../i18n";
import { ApiError, apiErrorKind } from "../api/client";
import { RetryButton } from "../ui/RetryButton";
import type { AppMessages } from "./messages.ru";

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

export function ActionFailure({ action, error, className }: { action: string; error: Error | null; className: string | undefined }) {
  const { app } = useMessages();
  if (error === null) return null;
  return (
    <span className={className} role="alert">
      {action}: {requestErrorMessage(app, error)}
    </span>
  );
}

export function requestErrorMessage(app: AppMessages, error: Error): string {
  return requestErrorParts(app, error, (text) => text).join("");
}

function requestErrorParts<T>(app: AppMessages, error: Error, command: (text: string) => T): Array<string | T> {
  const kind = apiErrorKind(error);
  if (kind === "unreachable") return app.unreachableMessage(command);
  if (!(error instanceof ApiError)) return [error.message];
  if (error.errors.length === 0) return [app.serverStatusError(error.status)];
  return [kind === "serverFailure" ? app.serverErrorPrefixed(error.message) : error.message];
}
