import type { MutationStatus } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { TaskChangesRequest } from "../../core/api/contract";
import { asError } from "../../core/errors";
import type { Task } from "../../core/model/types";
import { ApiError, apiErrorKind } from "../api/client";
import { useUpdateTask, type BodyEdit, type TaskChange, type UpdateTaskVariables } from "../app/queries";
import { useMessages } from "../i18n";
import type { TaskMessages } from "./messages.ru";
import { saveErrorText } from "./save-error";

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
  const [savesInFlight, setSavesInFlight] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const errorText = (error: Error) => saveErrorText(error, app, taskMessages);

  const attemptSave = async (variables: Omit<UpdateTaskVariables, "id">): Promise<Error | null> => {
    setSaveError(null);
    setSaveFailed(false);
    setSavesInFlight((count) => count + 1);
    try {
      await updateTask.mutateAsync({ id: task.id, ...variables });
      return null;
    } catch (error) {
      setSaveFailed(true);
      return asError(error);
    } finally {
      setSavesInFlight((count) => count - 1);
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
    saving: savesInFlight > 0,
    saveFailed,
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

const SAVED_NOTE_MS = 2000;

export function useSaveNote(lastSave: SaveStatus): string {
  const { task: taskMessages } = useMessages();
  const [fadedAt, setFadedAt] = useState<number | null>(null);
  const savedAt = lastSave.phase === "saved" ? lastSave.at : null;

  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setFadedAt(savedAt), SAVED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  if (lastSave.phase === "saving") return taskMessages.saving;
  return savedAt !== null && savedAt !== fadedAt ? taskMessages.saved : "";
}
