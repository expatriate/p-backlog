import { useEffect, useState } from "react";
import type { TaskChangesRequest } from "../../core/api/contract";
import type { Task } from "../../core/model/types";
import { ApiError } from "../api/client";
import type { AppMessages } from "../app/messages.ru";
import { TaskGoneError, useUpdateTask, type BodyEdit, type TaskChange } from "../app/queries";
import { requestErrorMessage } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import type { TaskMessages } from "./messages.ru";
import type { RefsSaveResult } from "./TaskRefs";

type BodyDraft = { text: string; from: BodyEdit };

type BodyEditor = { phase: "closed" } | { phase: "editing"; draft: BodyDraft; error: Error | null } | { phase: "saving"; draft: BodyDraft };

type LastSave = { pending: boolean; succeeded: boolean; submittedAt: number };

const CLOSED: BodyEditor = { phase: "closed" };

export function useTaskSaving(task: Task) {
  const { app, task: t } = useMessages();
  const updateTask = useUpdateTask();
  const [bodyEditor, setBodyEditor] = useState<BodyEditor>(CLOSED);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const errorText = (error: Error) => saveErrorText(error, app, t);

  const save = async (change: TaskChange): Promise<boolean> => {
    setSaveError(null);
    try {
      await updateTask.mutateAsync({ id: task.id, change });
      return true;
    } catch (error) {
      setSaveError(asError(error));
      return false;
    }
  };

  const saveRefs = async (change: TaskChange): Promise<RefsSaveResult> => {
    setSaveError(null);
    try {
      await updateTask.mutateAsync({ id: task.id, change });
      return { saved: true };
    } catch (error) {
      if (!isConflict(error)) return { saved: false, fieldError: errorText(asError(error)) };
      setSaveError(asError(error));
      return { saved: false, fieldError: null };
    }
  };

  const taskOrigin: BodyEdit = { version: task.version, body: task.body };
  const editBody = (text: string | null) => setBodyEditor((editor) => withBodyText(editor, text, taskOrigin));

  const saveBody = async (text: string) => {
    const from = bodyEditor.phase === "closed" ? taskOrigin : bodyEditor.draft.from;
    setBodyEditor((editor) => (editor.phase === "closed" ? editor : { phase: "saving", draft: editor.draft }));
    setSaveError(null);
    try {
      await updateTask.mutateAsync({ id: task.id, change: () => ({ body: text }), bodyEdit: from });
      setBodyEditor((editor) => (editor.phase === "closed" ? editor : { phase: "editing", draft: editor.draft, error: null }));
    } catch (error) {
      setBodyEditor((editor) => failedBodySave(editor, error));
      throw error;
    }
  };

  const bodyAlert = bodyEditor.phase === "editing" && bodyEditor.error !== null ? (isConflict(bodyEditor.error) ? t.draftConflict : errorText(bodyEditor.error)) : null;
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

function failedBodySave(editor: BodyEditor, error: unknown): BodyEditor {
  if (editor.phase === "closed") return editor;
  const current = error instanceof ApiError ? error.current : undefined;
  const from = current === undefined ? editor.draft.from : { version: current.version, body: current.body };
  return { phase: "editing", draft: { ...editor.draft, from }, error: asError(error) };
}

function saveErrorText(error: Error, app: AppMessages, t: TaskMessages): string {
  if (isConflict(error)) return t.taskConflict;
  if (error instanceof TaskGoneError) return t.taskGone(error.taskId);
  return requestErrorMessage(app, error);
}

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

const SAVED_NOTE_MS = 2000;

export function useSaveNote({ pending, succeeded, submittedAt }: LastSave, noAlerts: boolean, t: TaskMessages): string {
  const [fadedSave, setFadedSave] = useState<number | null>(null);
  const success = succeeded && noAlerts;

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setFadedSave(submittedAt), SAVED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [success, submittedAt]);

  if (pending) return t.saving;
  return success && fadedSave !== submittedAt ? t.saved : "";
}
