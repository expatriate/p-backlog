import { closingsOf, isFixedNow, type TaskHistory } from "../history";
import { projectFixKey, type ProjectFixKey } from "../../code/fix-key";
import type { FixCommit, FixRequest } from "../../code/types";
import { retainedSince } from "../../model/history-window";
import { groupBy } from "../../collections";

const HASH_PATTERN = /(?<![\p{L}\p{N}])[0-9a-f]{7,40}(?![\p{L}\p{N}])/gu;

export function reasonHashes(reason: string | undefined): string[] {
  return reason === undefined ? [] : [...reason.matchAll(HASH_PATTERN)].map((match) => match[0]);
}

export function fixRequests(histories: readonly TaskHistory[], now: Date): FixRequest[] {
  return [...groupBy(retainedFixes(histories, now), (history) => history.projectId).entries()].flatMap(([projectId, fixes]) => {
    const hashes = [...new Set(fixes.flatMap((history) => reasonHashes(history.reason)))];
    return hashes.length === 0 ? [] : [{ projectId, hashes }];
  });
}

export type FixCommitEntry = { key: ProjectFixKey; commit: FixCommit };

export function fixCommitEntry(history: TaskHistory, commits: ReadonlyMap<ProjectFixKey, FixCommit>): FixCommitEntry | undefined {
  return reasonHashes(history.reason)
    .map((hash) => projectFixKey(history.projectId, hash))
    .flatMap((key) => {
      const commit = commits.get(key);
      return commit === undefined ? [] : [{ key, commit }];
    })
    .at(0);
}

export function retainedFixes(histories: readonly TaskHistory[], now: Date): TaskHistory[] {
  const since = retainedSince(now);
  return histories.filter((history) => {
    const closing = closingsOf(history).at(-1);
    return isFixedNow(history) && closing !== undefined && closing.at >= since;
  });
}
