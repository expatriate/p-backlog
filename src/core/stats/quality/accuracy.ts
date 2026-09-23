import { CANDIDATE_EVIDENCE, RECORDED_METHODS, type CandidateEvidence } from "../../journal/events";
import { closingsOf, type TaskHistory } from "../history";
import { formatLocalIso } from "../../model/dates";
import type { Period } from "../period";
import { weekWindows } from "../weeks";
import type { AccuracyRow, AccuracyWeek, MethodAccuracyRow } from "../types";

type Outcome = "closed" | "verified" | "open";
type Episode = { evidence: CandidateEvidence; outcome: Outcome };
type OutcomeCounts = Omit<AccuracyRow, "evidence">;

export function accuracy(histories: readonly TaskHistory[], period: Period): AccuracyRow[] {
  const episodes = histories.flatMap((history) =>
    history.candidates
      .filter((candidate) => period.contains(candidate.at))
      .map((candidate): Episode => ({ evidence: candidate.evidence, outcome: outcomeAfter(history, candidate.at) })),
  );
  if (episodes.length === 0) return [];
  const byEvidence = CANDIDATE_EVIDENCE.flatMap((evidence) => {
    const own = episodes.filter((episode) => episode.evidence === evidence);
    return own.length === 0 ? [] : [{ evidence, ...outcomeCounts(own) }];
  });
  return [...byEvidence, { evidence: "total", ...outcomeCounts(episodes) }];
}

export function accuracyWeeks(histories: readonly TaskHistory[], now: Date): AccuracyWeek[] {
  return weekWindows(now).map((week) => {
    const decided = histories.flatMap((history) =>
      history.candidates
        .filter((candidate) => week.contains(candidate.at) && candidate.evidence !== "no-source")
        .map((candidate) => outcomeAfter(history, candidate.at))
        .filter((outcome) => outcome !== "open"),
    );
    const closed = decided.filter((outcome) => outcome === "closed").length;
    return { start: formatLocalIso(new Date(week.from)), decided: decided.length, precision: decided.length === 0 ? null : closed / decided.length };
  });
}

export function methodAccuracy(histories: readonly TaskHistory[], period: Period): MethodAccuracyRow[] {
  const episodes = histories.flatMap((history) =>
    history.candidates
      .filter((candidate) => candidate.evidence === "source-changed" && period.contains(candidate.at))
      .map((candidate) => ({ by: candidate.method, outcome: outcomeAfter(history, candidate.at) })),
  );
  return RECORDED_METHODS.flatMap((by) => {
    const own = episodes.filter((episode) => episode.by === by);
    return own.length === 0 ? [] : [{ by, ...outcomeCounts(own) }];
  });
}

function outcomeAfter(history: TaskHistory, moment: number): Outcome {
  const closedAt = closingsOf(history).find((closing) => closing.at > moment)?.at;
  const verifiedAt = history.verifications.find((verification) => verification > moment);
  if (closedAt === undefined) return verifiedAt === undefined ? "open" : "verified";
  return verifiedAt !== undefined && verifiedAt < closedAt ? "verified" : "closed";
}

function outcomeCounts(episodes: readonly { outcome: Outcome }[]): OutcomeCounts {
  const count = (outcome: Outcome) => episodes.filter((episode) => episode.outcome === outcome).length;
  const closed = count("closed");
  const verified = count("verified");
  return { candidates: episodes.length, closed, verified, open: count("open"), precision: closed + verified === 0 ? null : closed / (closed + verified) };
}
