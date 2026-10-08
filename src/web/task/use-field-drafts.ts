import type { Task } from "../../core/model/types";
import { useMessages } from "../i18n";
import { useDraft } from "../ui/use-draft";
import { canonicalTags } from "./tag-input";
import { normalizeTaskId } from "./normalize-task-id";

const trimTitle = (text: string) => text.trim();

export function useFieldDrafts(task: Task) {
  const { task: taskMessages } = useMessages();
  const title = useDraft<HTMLTextAreaElement>(task.title, trimTitle);
  const tags = useDraft(task.tags.join(", "), canonicalTags);
  const epic = useDraft(task.epic ?? "", normalizeTaskId);
  const labelled = [
    { draft: title, label: taskMessages.title },
    { draft: tags, label: taskMessages.tagsField },
    { draft: epic, label: taskMessages.epicField },
  ];
  return {
    title,
    tags,
    epic,
    unsaved: labelled.some(({ draft }) => draft.unsaved),
    conflictAlerts: labelled.filter(({ draft }) => draft.conflicted).map(({ label }) => taskMessages.fieldConflict(label)),
  };
}
