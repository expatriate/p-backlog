import { DAY_MS } from "../../model/lifecycle";
import { closingsOf, type TaskHistory } from "../history";
import { median } from "../numbers";
import type { FixBreakdown, FixCommit } from "../types";

const HASH_PATTERN = /(?<![\p{L}\p{N}])[0-9a-f]{7,40}(?![\p{L}\p{N}])/gu;

export type FixRequest = { projectId: string; hashes: string[] };

export function reasonHashes(reason: string | undefined): string[] {
  return reason === undefined ? [] : [...reason.matchAll(HASH_PATTERN)].map((match) => match[0]);
}

export function fixKey(projectId: string, hash: string): string {
  return `${projectId} ${hash}`;
}

export function fixRequests(histories: readonly TaskHistory[], from: number, to: number): FixRequest[] {
  const byProject = new Map<string, Set<string>>();
  for (const { history } of fixClosings(histories, from, to)) {
    const hashes = byProject.get(history.projectId) ?? new Set<string>();
    for (const hash of reasonHashes(history.reason)) hashes.add(hash);
    byProject.set(history.projectId, hashes);
  }
  return [...byProject.entries()].filter(([, hashes]) => hashes.size > 0).map(([projectId, hashes]) => ({ projectId, hashes: [...hashes] }));
}

export function fixBreakdown(histories: readonly TaskHistory[], from: number, to: number, commits: ReadonlyMap<string, FixCommit>): FixBreakdown {
  const resolved = fixClosings(histories, from, to).map(({ history }) => {
    const commit = reasonHashes(history.reason)
      .map((hash) => commits.get(fixKey(history.projectId, hash)))
      .find((candidate) => candidate !== undefined);
    return commit === undefined ? undefined : { byAgent: commit.byAgent, days: (Date.parse(commit.date) - history.createdAt) / DAY_MS };
  });
  const agentDays = resolved.flatMap((fix) => (fix?.byAgent === true ? [fix.days] : []));
  const humanDays = resolved.flatMap((fix) => (fix?.byAgent === false ? [fix.days] : []));
  return {
    agent: agentDays.length,
    human: humanDays.length,
    unknown: resolved.filter((fix) => fix === undefined).length,
    agentMedianDays: median(agentDays),
    humanMedianDays: median(humanDays),
  };
}

function fixClosings(histories: readonly TaskHistory[], from: number, to: number): { history: TaskHistory }[] {
  return histories.flatMap((history) =>
    closingsOf(history)
      .filter((closing) => closing.resolution === "fixed" && closing.at >= from && closing.at <= to)
      .map(() => ({ history })),
  );
}
