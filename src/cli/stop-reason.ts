import type { Candidate } from "../core/check/candidates";
import type { Language } from "../core/i18n/language";
import { hookMessage } from "../core/stats/cost/hook-signature";
import { cliMessages, type CliMessages } from "./messages";

export const STOP_REASON_LIMIT = 500;

export function stopReason(language: Language, projectId: string, candidates: readonly Candidate[]): string {
  const cli = cliMessages(language);
  const items = candidates.map((candidate) => briefEvidence(cli, candidate));
  const shown: string[] = [];
  for (const item of items) {
    if (compose(language, cli, projectId, [...shown, item], items.length - shown.length - 1).length > STOP_REASON_LIMIT) break;
    shown.push(item);
  }
  return compose(language, cli, projectId, shown, items.length - shown.length);
}

function compose(language: Language, cli: CliMessages, projectId: string, shown: readonly string[], hidden: number): string {
  const more = hidden > 0 ? cli.stopReasonMore(hidden) : "";
  return hookMessage(language, projectId, cli.stopReasonBody(shown.join("; "), more));
}

function briefEvidence(cli: CliMessages, candidate: Candidate): string {
  switch (candidate.kind) {
    case "source-changed":
      return `${candidate.task.id} (${cli.candidateChanged(candidate.path)})`;
    case "source-missing":
      return candidate.renamedTo === undefined
        ? `${candidate.task.id} (${cli.candidateMissing(candidate.path)})`
        : `${candidate.task.id} (${cli.candidateRenamed(candidate.path, candidate.renamedTo)})`;
    case "duplicate":
      return `${candidate.task.id} (${cli.candidateSimilarTo(candidate.other.id)})`;
  }
}
