import type { MutationStatus } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { TaskChangesRequest } from "../../core/api/contract";
import type { Task } from "../../core/model/types";
import { ApiError, apiErrorKind } from "../api/client";
import type { AppMessages } from "../app/messages.ru";
import { TaskGoneError, useUpdateTask, type BodyEdit, type TaskChange, type UpdateTaskVariables } from "../app/queries";
import { requestErrorMessage } from "../app/RequestFailure";
import { useMessages } from "../i18n";
import type { TaskMessages } from "./messages.ru";

export type RefsSaveResult = { saved: true } | { saved: false; fieldError: string | null };

type BodyDraft = { text: string; from: BodyEdit };

type BodyEditor = { phase: "closed" } | { phase: "editing"; draft: BodyDraft; error: Error | null } | { phase: "saving"; draft: BodyDraft };

export type BodyEditorView = { phase: "closed" } | { phase: "editing" | "saving"; text: string };

type SaveStatus = { phase: "idle" | "saving" | "failed" } | { phase: "saved"; at: number };

const CLOSED: BodyEditor = { phase: "closed" };

export function useTaskSaving(task: Task) {
  const { app, task: taskMessages } = useMessages();
  const updateTask = useUpdateTask();
  const [bodyEditor, setBodyEditor] = useState<BodyEditor>(CLOSED);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const errorText = (error: Error) => saveErrorText(error, app, taskMessages);

  const attemptSave = async (variables: Omit<UpdateTaskVariables, "id">): Promise<Error | null> => {
    setSaveError(null);
    try {
      await updateTask.mutateAsync({ id: task.id, ...variables });
      return null;
    } catch (error) {
      return asError(error);
    }
  };

  const save = async (change: TaskChange): Promise<boolean> => {
    const failure = await attemptSave({ change });
    if (failure !== null) setSaveError(failure);
    return failure === null;
  };

  const saveRefs = async (change: TaskChange): Promise<RefsSaveResult> => {
    const failure = await attemptSave({ change });
    if (failure === null) return { saved: true };
    if (apiErrorKind(failure) !== "conflict") return { saved: false, fieldError: errorText(failure) };
    setSaveError(failure);
    return { saved: false, fieldError: null };
  };

  const taskOrigin: BodyEdit = { version: task.version, body: task.body };
  const editBody = (text: string) => setBodyEditor((editor) => withBodyText(editor, text, taskOrigin));

  const saveBody = async (text: string): Promise<boolean> => {
    const from = bodyEditor.phase === "closed" ? taskOrigin : bodyEditor.draft.from;
    setBodyEditor((editor) => (editor.phase === "closed" ? editor : { phase: "saving", draft: editor.draft }));
    const failure = await attemptSave({ change: () => ({ body: text }), bodyEdit: from });
    setBodyEditor((editor) => (failure === null ? savedBody(editor) : failedBodySave(editor, failure)));
    return failure === null;
  };

  const bodyError = bodyEditor.phase === "editing" ? bodyEditor.error : null;
  const bodyAlert = bodyError === null ? null : bodyErrorText(bodyError, errorText, taskMessages);

  return {
    save,
    apply: (changes: TaskChangesRequest) => save(() => changes),
    saveRefs,
    body: { editor: bodyEditorView(bodyEditor), edit: editBody, close: () => setBodyEditor(CLOSED), save: saveBody },
    alerts: [bodyAlert, saveError === null ? null : errorText(saveError)],
    lastSave: saveStatusOf(updateTask),
  };
}

function bodyEditorView(editor: BodyEditor): BodyEditorView {
  return editor.phase === "closed" ? editor : { phase: editor.phase, text: editor.draft.text };
}

function saveStatusOf({ status, submittedAt }: { status: MutationStatus; submittedAt: number }): SaveStatus {
  if (status === "pending") return { phase: "saving" };
  if (status === "success") return { phase: "saved", at: submittedAt };
  return { phase: status === "error" ? "failed" : "idle" };
}

function withBodyText(editor: BodyEditor, text: string, taskOrigin: BodyEdit): BodyEditor {
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
  return apiErrorKind(error) === "conflict" ? taskMessages.draftConflict : errorText(error);
}

function saveErrorText(error: Error, app: AppMessages, taskMessages: TaskMessages): string {
  if (apiErrorKind(error) === "conflict") return taskMessages.taskConflict;
  if (error instanceof TaskGoneError) return taskMessages.taskGone(error.taskId);
  return requestErrorMessage(app, error);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

const SAVED_NOTE_MS = 2000;

export function useSaveNote(lastSave: SaveStatus, cardAlerts: readonly string[]): string {
  const { task: taskMessages } = useMessages();
  const [fadedAt, setFadedAt] = useState<number | null>(null);
  const cleanSaveAt = lastSave.phase === "saved" && cardAlerts.length === 0 ? lastSave.at : null;

  useEffect(() => {
    if (cleanSaveAt === null) return;
    const timer = setTimeout(() => setFadedAt(cleanSaveAt), SAVED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [cleanSaveAt]);

  if (lastSave.phase === "saving") return taskMessages.saving;
  return cleanSaveAt !== null && cleanSaveAt !== fadedAt ? taskMessages.saved : "";
}
