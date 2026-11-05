import { apiErrorKind } from "../api/client";
import type { AppMessages } from "../app/messages.ru";
import { SaveNotSentError, TaskGoneError } from "../app/queries";
import { requestErrorMessage } from "../app/RequestFailure";
import type { TaskMessages } from "./messages.ru";

export function saveErrorText(error: Error, app: AppMessages, taskMessages: TaskMessages): string {
  const kind = apiErrorKind(error);
  if (kind === "conflict") return taskMessages.taskConflict;
  if (kind === "timedOut") return taskMessages.saveTimedOut;
  if (error instanceof SaveNotSentError) return taskMessages.saveNotSent;
  if (error instanceof TaskGoneError) return taskMessages.taskGone(error.taskId);
  return requestErrorMessage(app, error);
}
