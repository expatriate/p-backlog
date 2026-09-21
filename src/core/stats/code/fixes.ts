import { closingsOf, isFixedNow, type TaskHistory } from "../history";
import type { FixCommit } from "../types";

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
  for (const history of fixClosings(histories, from, to)) {
    const hashes = byProject.get(history.projectId) ?? new Set<string>();
    for (const hash of reasonHashes(history.reason)) hashes.add(hash);
    byProject.set(history.projectId, hashes);
  }
  return [...byProject.entries()].filter(([, hashes]) => hashes.size > 0).map(([projectId, hashes]) => ({ projectId, hashes: [...hashes] }));
}

export type FixCommitEntry = { key: string; commit: FixCommit };

export function fixCommitEntry(history: TaskHistory, commits: ReadonlyMap<string, FixCommit>): FixCommitEntry | undefined {
  return reasonHashes(history.reason)
    .map((hash) => ({ key: fixKey(history.projectId, hash), commit: commits.get(fixKey(history.projectId, hash)) }))
    .flatMap(({ key, commit }) => (commit === undefined ? [] : [{ key, commit }]))
    .at(0);
}

function fixClosings(histories: readonly TaskHistory[], from: number, to: number): TaskHistory[] {
  return histories.filter((history) => {
    const closing = closingsOf(history).at(-1);
    return isFixedNow(history) && closing !== undefined && closing.at >= from && closing.at <= to;
  });
}
