import { CANDIDATE_EVIDENCE, RECORDED_MATCHES, RECORDED_METHODS, type CandidateEvidence } from "../../journal/events";
import { closingsOf, type CandidateSeen, type TaskHistory } from "../history";
import { formatLocalIso } from "../../model/dates";
import { dayWindows } from "../days";
import type { Period } from "../period";
import { weekWindows } from "../weeks";
import type { AccuracyPeriod, AccuracyRow, MatchAccuracyRow, MethodAccuracyRow, OutcomeCounts } from "../types";

type Outcome = "closed" | "verified" | "open";
type Episode = { candidate: CandidateSeen; outcome: Outcome };

export function isMeasuredEvidence(evidence: CandidateEvidence): boolean {
  return evidence !== "no-source";
}

export function decidedOf(counts: Pick<OutcomeCounts, "closed" | "verified">): number {
  return counts.closed + counts.verified;
}

export function accuracy(histories: readonly TaskHistory[], period: Period): AccuracyRow[] {
  const episodes = episodesOf(histories, (candidate) => period.contains(candidate.at));
  if (episodes.length === 0) return [];
  const byEvidence = countsPerKey(episodes, CANDIDATE_EVIDENCE, (candidate) => candidate.evidence).map(([evidence, counts]) => ({ evidence, ...counts }));
  return [...byEvidence, { evidence: "total", ...outcomeCounts(episodes) }];
}

function accuracyOver(periods: readonly Period[], histories: readonly TaskHistory[]): AccuracyPeriod[] {
  return periods.map((span) => {
    const counts = outcomeCounts(episodesOf(histories, (candidate) => span.contains(candidate.at) && isMeasuredEvidence(candidate.evidence)));
    return { start: formatLocalIso(new Date(span.from)), decided: decidedOf(counts), precision: counts.precision };
  });
}

export function accuracyWeeks(histories: readonly TaskHistory[], now: Date): AccuracyPeriod[] {
  return accuracyOver(weekWindows(now), histories);
}

export function accuracyDays(histories: readonly TaskHistory[], now: Date): AccuracyPeriod[] {
  return accuracyOver(dayWindows(now), histories);
}

export function methodAccuracy(histories: readonly TaskHistory[], period: Period): MethodAccuracyRow[] {
  return splitAccuracy(histories, period, { evidence: "source-changed", keys: RECORDED_METHODS, keyOf: (candidate) => candidate.method });
}

export function matchAccuracy(histories: readonly TaskHistory[], period: Period): MatchAccuracyRow[] {
  return splitAccuracy(histories, period, { evidence: "duplicate", keys: RECORDED_MATCHES, keyOf: (candidate) => candidate.match });
}

type AccuracySplit<K extends string> = { evidence: CandidateEvidence; keys: readonly K[]; keyOf: (candidate: CandidateSeen) => K };

function splitAccuracy<K extends string>(histories: readonly TaskHistory[], period: Period, { evidence, keys, keyOf }: AccuracySplit<K>): ({ by: K } & OutcomeCounts)[] {
  const episodes = episodesOf(histories, (candidate) => candidate.evidence === evidence && period.contains(candidate.at));
  return countsPerKey(episodes, keys, keyOf).map(([by, counts]) => ({ by, ...counts }));
}

function episodesOf(histories: readonly TaskHistory[], include: (candidate: CandidateSeen) => boolean): Episode[] {
  return histories.flatMap((history) => history.candidates.filter(include).map((candidate) => ({ candidate, outcome: outcomeAfter(history, candidate.at) })));
}

function countsPerKey<K extends string>(episodes: readonly Episode[], keys: readonly K[], keyOf: (candidate: CandidateSeen) => K): [K, OutcomeCounts][] {
  return keys.flatMap((key) => {
    const own = episodes.filter((episode) => keyOf(episode.candidate) === key);
    return own.length === 0 ? [] : [[key, outcomeCounts(own)]];
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
  const decided = decidedOf({ closed, verified });
  return { candidates: episodes.length, closed, verified, open: count("open"), precision: decided === 0 ? null : closed / decided };
}
