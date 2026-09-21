import { CANDIDATE_EVIDENCE, type CandidateEvidence } from "../../journal/events";
import { closingsOf, type TaskHistory } from "../history";
import { formatLocalIso } from "../../model/dates";
import { weekWindows } from "../weeks";
import type { AccuracyRow, AccuracyWeek, SymbolAccuracyRow } from "../types";

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

export function accuracyWeeks(histories: readonly TaskHistory[], now: Date): AccuracyWeek[] {
  return weekWindows(now).map(({ start, inWeek }) => {
    const decided = histories.flatMap((history) =>
      history.candidates
        .filter((candidate) => inWeek(candidate.at) && candidate.evidence !== "no-source")
        .map((candidate) => outcomeAfter(history, candidate.at))
        .filter((outcome) => outcome !== "open"),
    );
    const closed = decided.filter((outcome) => outcome === "closed").length;
    return { start: formatLocalIso(start), decided: decided.length, precision: decided.length === 0 ? null : closed / decided.length };
  });
}

export function symbolAccuracy(histories: readonly TaskHistory[], from: number, to: number): SymbolAccuracyRow[] {
  const episodes = histories.flatMap((history) =>
    history.candidates
      .filter((candidate) => candidate.evidence === "source-changed" && candidate.at >= from && candidate.at <= to)
      .map((candidate) => ({ by: candidate.bySymbol === true ? "symbol" : "file", outcome: outcomeAfter(history, candidate.at) }) as const),
  );
  return (["symbol", "file"] as const).flatMap((by) => {
    const own = episodes.filter((episode) => episode.by === by);
    if (own.length === 0) return [];
    const count = (outcome: Outcome) => own.filter((episode) => episode.outcome === outcome).length;
    const closed = count("closed");
    const verified = count("verified");
    return [{ by, candidates: own.length, closed, verified, open: count("open"), precision: closed + verified === 0 ? null : closed / (closed + verified) }];
  });
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
