import { useEffect, useState } from "react";
import type { TaskChangesRequest } from "../../core/api/contract";
import type { Task } from "../../core/model/types";
import { ApiError } from "../api/client";
import type { AppMessages } from "../app/messages.ru";
import { TaskGoneError, useUpdateTask, type BodyEdit, type TaskChange, type UpdateTaskVariables } from "../app/queries";
import { requestErrorMessage } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import type { TaskMessages } from "./messages.ru";
import type { RefsSaveResult } from "./TaskRefs";

type BodyDraft = { text: string; from: BodyEdit };

type BodyEditor = { phase: "closed" } | { phase: "editing"; draft: BodyDraft; error: Error | null } | { phase: "saving"; draft: BodyDraft };

type LastSave = { pending: boolean; succeeded: boolean; submittedAt: number };

const CLOSED: BodyEditor = { phase: "closed" };

export function useTaskSaving(task: Task) {
  const { app, task: taskMessages } = useMessages();
  const updateTask = useUpdateTask();
  const [bodyEditor, setBodyEditor] = useState<BodyEditor>(CLOSED);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const errorText = (error: Error) => saveErrorText(error, app, taskMessages);

  const failureOf = async (variables: Omit<UpdateTaskVariables, "id">): Promise<Error | null> => {
    setSaveError(null);
    try {
      await updateTask.mutateAsync({ id: task.id, ...variables });
      return null;
    } catch (error) {
      return asError(error);
    }
  };

  const save = async (change: TaskChange): Promise<boolean> => {
    const failure = await failureOf({ change });
    if (failure !== null) setSaveError(failure);
    return failure === null;
  };

  const saveRefs = async (change: TaskChange): Promise<RefsSaveResult> => {
    const failure = await failureOf({ change });
    if (failure === null) return { saved: true };
    if (!isConflict(failure)) return { saved: false, fieldError: errorText(failure) };
    setSaveError(failure);
    return { saved: false, fieldError: null };
  };

  const taskOrigin: BodyEdit = { version: task.version, body: task.body };
  const editBody = (text: string | null) => setBodyEditor((editor) => withBodyText(editor, text, taskOrigin));

  const saveBody = async (text: string): Promise<boolean> => {
    const from = bodyEditor.phase === "closed" ? taskOrigin : bodyEditor.draft.from;
    setBodyEditor((editor) => (editor.phase === "closed" ? editor : { phase: "saving", draft: editor.draft }));
    const failure = await failureOf({ change: () => ({ body: text }), bodyEdit: from });
    setBodyEditor((editor) => (failure === null ? savedBody(editor) : failedBodySave(editor, failure)));
    return failure === null;
  };

  const bodyError = bodyEditor.phase === "editing" ? bodyEditor.error : null;
  const bodyAlert = bodyError === null ? null : bodyErrorText(bodyError, errorText, taskMessages);
  const lastSave: LastSave = { pending: updateTask.isPending, succeeded: updateTask.isSuccess, submittedAt: updateTask.submittedAt };

  return {
    save,
    apply: (changes: TaskChangesRequest) => save(() => changes),
    saveRefs,
    body: { draft: bodyEditor.phase === "closed" ? null : bodyEditor.draft.text, saving: bodyEditor.phase === "saving", edit: editBody, save: saveBody },
    alerts: [bodyAlert, saveError === null ? null : errorText(saveError)],
    lastSave,
  };
}

function withBodyText(editor: BodyEditor, text: string | null, taskOrigin: BodyEdit): BodyEditor {
  if (text === null) return CLOSED;
  if (editor.phase === "closed") return { phase: "editing", draft: { text, from: taskOrigin }, error: null };
  return { ...editor, draft: { ...editor.draft, text } };
}

function savedBody(editor: BodyEditor): BodyEditor {
  return editor.phase === "closed" ? editor : { phase: "editing", draft: editor.draft, error: null };
}

function failedBodySave(editor: BodyEditor, error: Error): BodyEditor {
  if (editor.phase === "closed") return editor;
  const current = error instanceof ApiError ? error.current : undefined;
  const from = current === undefined ? editor.draft.from : { version: current.version, body: current.body };
  return { phase: "editing", draft: { ...editor.draft, from }, error };
}

function bodyErrorText(error: Error, errorText: (error: Error) => string, taskMessages: TaskMessages): string {
  return isConflict(error) ? taskMessages.draftConflict : errorText(error);
}

function saveErrorText(error: Error, app: AppMessages, taskMessages: TaskMessages): string {
  if (isConflict(error)) return taskMessages.taskConflict;
  if (error instanceof TaskGoneError) return taskMessages.taskGone(error.taskId);
  return requestErrorMessage(app, error);
}

function isConflict(error: Error): boolean {
  return error instanceof ApiError && error.isConflict;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

const SAVED_NOTE_MS = 2000;

export function useSaveNote({ pending, succeeded, submittedAt }: LastSave, cardAlerts: readonly string[]): string {
  const { task: taskMessages } = useMessages();
  const [fadedSave, setFadedSave] = useState<number | null>(null);
  const success = succeeded && cardAlerts.length === 0;

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setFadedSave(submittedAt), SAVED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [success, submittedAt]);

  if (pending) return taskMessages.saving;
  return success && fadedSave !== submittedAt ? taskMessages.saved : "";
}
