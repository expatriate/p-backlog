import type { Candidate } from "../core/check/candidates";
import { hookMessage } from "../core/stats/cost/hook-signature";

export const STOP_REASON_LIMIT = 500;

export function stopReason(projectId: string, candidates: readonly Candidate[]): string {
  const items = candidates.map(briefEvidence);
  const shown: string[] = [];
  for (const item of items) {
    if (compose(projectId, [...shown, item], items.length - shown.length - 1).length > STOP_REASON_LIMIT) break;
    shown.push(item);
  }
  return compose(projectId, shown, items.length - shown.length);
}

function compose(projectId: string, shown: readonly string[], hidden: number): string {
  const more = hidden > 0 ? ` и ещё ${hidden}` : "";
  return hookMessage(projectId, `после последней проверки менялся код задач — ${shown.join("; ")}${more}. Перепроверь их по скиллу backlog, раздел «Перепроверить задачи».`);
}

function briefEvidence(candidate: Candidate): string {
  switch (candidate.kind) {
    case "source-changed":
      return `${candidate.task.id} (изменён ${candidate.path})`;
    case "source-missing":
      return candidate.renamedTo === undefined
        ? `${candidate.task.id} (нет файла ${candidate.path})`
        : `${candidate.task.id} (${candidate.path} переименован в ${candidate.renamedTo})`;
    case "duplicate":
      return `${candidate.task.id} (похожа на ${candidate.other.id})`;
  }
}
