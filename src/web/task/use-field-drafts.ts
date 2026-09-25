import type { Task } from "../../core/model/types";
import { useMessages } from "../i18n";
import { useDraft } from "../ui/use-draft";
import { canonicalTags } from "./TaskFields";
import { normalizeTaskId } from "./normalize-task-id";

const trimTitle = (text: string) => text.trim();

export function useFieldDrafts(task: Task) {
  const { task: t } = useMessages();
  const [title, titleRef] = useDraft<HTMLTextAreaElement>(task.title, trimTitle);
  const [tags, tagsRef] = useDraft(task.tags.join(", "), canonicalTags);
  const [epic, epicRef] = useDraft(task.epic ?? "", normalizeTaskId);
  const labelled = [
    { draft: title, label: t.title },
    { draft: tags, label: t.tagsField },
    { draft: epic, label: t.epicField },
  ];
  return {
    title,
    titleRef,
    tags,
    tagsRef,
    epic,
    epicRef,
    unsaved: labelled.some(({ draft }) => draft.unsaved),
    conflictAlerts: labelled.filter(({ draft }) => draft.conflicted).map(({ label }) => t.fieldConflict(label)),
  };
}
