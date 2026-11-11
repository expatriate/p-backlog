import type { JournalEvent, TaskOrigin } from "../journal/events";
import type { Task } from "../model/types";

type VerifiedCommit = { at: string; commit: string };

export type MarkCommits = { origins: ReadonlyMap<string, TaskOrigin>; verifications: ReadonlyMap<string, VerifiedCommit> };

export const NO_MARK_COMMITS: MarkCommits = { origins: new Map(), verifications: new Map() };

export function markCommitsIn(events: readonly JournalEvent[]): MarkCommits {
  return {
    origins: new Map(events.flatMap((event) => (event.kind === "created" && event.origin !== undefined ? [[event.task, event.origin] as const] : []))),
    verifications: new Map(events.flatMap((event) => (event.kind === "verified" && event.commit !== undefined ? [[event.task, { at: event.at, commit: event.commit }] as const] : []))),
  };
}

export function isReviewable(task: Task): boolean {
  return task.type === "task" && (task.status === "backlog" || task.status === "blocked");
}

export function reviewMark(task: Task): number {
  const verified = task.verified === undefined ? Number.NEGATIVE_INFINITY : Date.parse(task.verified);
  return Math.max(Date.parse(task.created), verified);
}

export function commitAtMark(task: Task, marks: MarkCommits): string | undefined {
  return task.verified === undefined ? marks.origins.get(task.id)?.commit : verifiedCommit(task, task.verified, marks);
}

export function latestRecordedCommit(task: Task, marks: MarkCommits): string | undefined {
  return commitAtMark(task, marks) ?? marks.origins.get(task.id)?.commit;
}

function verifiedCommit(task: Task, verifiedAt: string, { verifications }: MarkCommits): string | undefined {
  const verification = verifications.get(task.id);
  const recordsCurrentVerification = verification !== undefined && Date.parse(verification.at) >= Date.parse(verifiedAt);
  return recordsCurrentVerification ? verification.commit : undefined;
}
