import { apiErrorKind } from "../api/client";
import type { AppMessages } from "../app/messages.ru";
import { TaskGoneError } from "../app/queries";
import { requestErrorMessage } from "../app/RequestFailure";
import type { TaskMessages } from "./messages.ru";

export function saveErrorText(error: Error, app: AppMessages, taskMessages: TaskMessages): string {
  if (apiErrorKind(error) === "conflict") return taskMessages.taskConflict;
  if (error instanceof TaskGoneError) return taskMessages.taskGone(error.taskId);
  return requestErrorMessage(app, error);
}
