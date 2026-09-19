import { CANDIDATE_EVIDENCE, type CandidateEvidence } from "../../journal/events";
import { closingsOf, type TaskHistory } from "../history";
import type { AccuracyRow } from "../types";

type Outcome = "closed" | "verified" | "open";
type Episode = { evidence: CandidateEvidence; outcome: Outcome };

export function accuracy(histories: readonly TaskHistory[], from: number, to: number): AccuracyRow[] {
  const episodes = histories.flatMap((history) =>
    history.candidates
      .filter((candidate) => candidate.at >= from && candidate.at <= to)
      .map((candidate): Episode => ({ evidence: candidate.evidence, outcome: outcomeAfter(history, candidate.at) })),
  );
  if (episodes.length === 0) return [];
  const byEvidence = CANDIDATE_EVIDENCE.flatMap((evidence) => {
    const own = episodes.filter((episode) => episode.evidence === evidence);
    return own.length === 0 ? [] : [accuracyRow(evidence, own)];
  });
  return [...byEvidence, accuracyRow("total", episodes)];
}

function outcomeAfter(history: TaskHistory, moment: number): Outcome {
  const closedAt = closingsOf(history).find((closing) => closing.at > moment)?.at;
  const verifiedAt = history.verifications.find((verification) => verification > moment);
  if (closedAt === undefined) return verifiedAt === undefined ? "open" : "verified";
  return verifiedAt !== undefined && verifiedAt < closedAt ? "verified" : "closed";
}

function accuracyRow(evidence: AccuracyRow["evidence"], episodes: readonly Episode[]): AccuracyRow {
  const count = (outcome: Outcome) => episodes.filter((episode) => episode.outcome === outcome).length;
  const closed = count("closed");
  const verified = count("verified");
  return { evidence, candidates: episodes.length, closed, verified, open: count("open"), precision: closed + verified === 0 ? null : closed / (closed + verified) };
}
