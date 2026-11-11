import { useEffect, useState } from "react";
import type { TaskChangesRequest } from "../../core/api/contract";
import { asError } from "../../core/errors";
import type { Task } from "../../core/model/types";
import { ApiError, apiErrorKind } from "../api/client";
import { useUpdateTask, type BodyEdit, type TaskChange, type UpdateTaskVariables } from "../app/queries";
import { useMessages } from "../i18n";
import type { SaveOutcome } from "../ui/save-outcome";
import { saveErrorText } from "./save-error";

type SaveOrigin = "card" | "refs" | "body";

type BodyDraft = { text: string; from: BodyEdit };

type BodyEditor = { phase: "closed" } | { phase: "editing"; draft: BodyDraft; error: Error | null } | { phase: "saving"; draft: BodyDraft };

export type BodyEditorView = { phase: "closed" } | { phase: "editing" | "saving"; text: string };

type LastSave = { phase: "idle" | "failed" } | { phase: "saved"; at: number };

type SaveStatus = LastSave | { phase: "saving" };

const CLOSED: BodyEditor = { phase: "closed" };

const SAVING: SaveStatus = { phase: "saving" };

const IDLE: LastSave = { phase: "idle" };

const FAILED: LastSave = { phase: "failed" };

const isConflict = (error: Error) => apiErrorKind(error) === "conflict";

export function useTaskSaving(task: Task) {
  const { app, task: taskMessages } = useMessages();
  const updateTask = useUpdateTask();
  const [bodyEditor, setBodyEditor] = useState<BodyEditor>(CLOSED);
  const [cardError, setCardError] = useState<Error | null>(null);
  const [savesInFlight, setSavesInFlight] = useState(0);
  const [lastSave, setLastSave] = useState<LastSave>(IDLE);
  const errorText = (error: Error) => saveErrorText(error, app, taskMessages);

  const routeFailure = (error: Error, origin: SaveOrigin): SaveOutcome => {
    if (origin === "refs" && !isConflict(error)) return { kind: "fieldError", message: errorText(error) };
    if (origin === "body") setBodyEditor((editor) => failedBodySave(editor, error));
    else setCardError(error);
    return { kind: "failed" };
  };

  const saveFrom = async (origin: SaveOrigin, variables: Omit<UpdateTaskVariables, "id">): Promise<SaveOutcome> => {
    setCardError(null);
    setLastSave(IDLE);
    setSavesInFlight((count) => count + 1);
    try {
      await updateTask.save({ id: task.id, ...variables });
      setLastSave(unlessFailed({ phase: "saved", at: Date.now() }));
      return { kind: "saved" };
    } catch (error) {
      setLastSave(FAILED);
      return routeFailure(asError(error), origin);
    } finally {
      setSavesInFlight((count) => count - 1);
    }
  };

  const save = (change: TaskChange) => saveFrom("card", { change });

  const taskOrigin: BodyEdit = { version: task.version, body: task.body };
  const editBody = (text: string) => setBodyEditor((editor) => withBodyText(editor, text, taskOrigin));

  const saveBody = async (text: string): Promise<SaveOutcome> => {
    const from = bodyEditor.phase === "closed" ? taskOrigin : bodyEditor.draft.from;
    setBodyEditor((editor) => (editor.phase === "closed" ? editor : { phase: "saving", draft: editor.draft }));
    const outcome = await saveFrom("body", { change: () => ({ body: text }), bodyEdit: from });
    if (outcome.kind === "saved") setBodyEditor(savedBody);
    return outcome;
  };

  const bodyErrorText = (error: Error) => (isConflict(error) ? taskMessages.draftConflict : errorText(error));
  const bodyError = bodyEditor.phase === "editing" ? bodyEditor.error : null;
  const bodyAlert = bodyError === null ? null : bodyErrorText(bodyError);
  const saving = savesInFlight > 0;

  return {
    save,
    apply: (changes: TaskChangesRequest) => save(() => changes),
    saveRefs: (change: TaskChange) => saveFrom("refs", { change }),
    body: { editor: bodyEditorView(bodyEditor), edit: editBody, close: () => setBodyEditor(CLOSED), save: saveBody },
    alerts: [bodyAlert, cardError === null ? null : errorText(cardError)],
    lastSave: saving ? SAVING : lastSave,
    saving,
    saveFailed: lastSave.phase === "failed",
  };
}

function bodyEditorView(editor: BodyEditor): BodyEditorView {
  return editor.phase === "closed" ? editor : { phase: editor.phase, text: editor.draft.text };
}

function unlessFailed(saved: LastSave): (current: LastSave) => LastSave {
  return (current) => (current.phase === "failed" ? current : saved);
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
