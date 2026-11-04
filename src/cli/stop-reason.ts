import type { Candidate } from "../core/check/candidates";
import type { Language } from "../core/i18n/language";
import { hookMessage } from "../core/hook-signature";
import { briefEvidence } from "./candidate-format";
import { cliMessages, type CliMessages } from "./messages";

export const STOP_REASON_LIMIT = 500;

export type StopReason = { text: string; namedTaskIds: readonly string[] };

export function stopReason(language: Language, projectId: string, candidates: readonly Candidate[]): StopReason {
  const cli = cliMessages(language);
  const text = (named: readonly NamedCandidate[]) =>
    compose(
      language,
      cli,
      projectId,
      named.map(({ item }) => item),
      candidates.length - named.length,
    );
  const named: NamedCandidate[] = [];
  for (const candidate of candidates) {
    const next = { id: candidate.task.id, item: briefEvidence(cli, candidate) };
    if (text([...named, next]).length <= STOP_REASON_LIMIT) named.push(next);
  }
  const [first] = candidates;
  if (named.length === 0 && first !== undefined) named.push({ id: first.task.id, item: first.task.id });
  return { text: text(named), namedTaskIds: named.map(({ id }) => id) };
}

type NamedCandidate = { id: string; item: string };

function compose(language: Language, cli: CliMessages, projectId: string, shown: readonly string[], hidden: number): string {
  const more = hidden > 0 ? cli.stopReasonMore(hidden) : "";
  return hookMessage(language, projectId, cli.stopReasonBody(shown.join("; "), more));
}
