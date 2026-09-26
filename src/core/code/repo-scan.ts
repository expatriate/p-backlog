import type { GitRunner } from "../git/run";
import type { CommitUnit, RepoCode } from "../stats/types";
import { churnWindowStart } from "./code-window";
import { readCommitsSince, readLines, readUnits, type HistoryRange, type HistoryRead, type RepoRefs, type ScannedCommit } from "./git-code";

export type RepoScan = {
  head: string;
  main: string | null;
  commits: ScannedCommit[];
  units: CommitUnit[];
  lines: { path: string; lines: number }[];
};

export async function scanRepo(git: GitRunner, repo: string, { refs, now, previous }: { refs: RepoRefs; now: Date; previous: RepoScan | undefined }): Promise<RepoScan | null> {
  const { head, main } = refs;
  if (head === null) return null;
  const since = churnWindowStart(now);
  const [commits, units, lines] = await Promise.all([
    extendHistory((range) => readCommitsSince(git, repo, since, range), head, historyOf(previous?.head, previous?.commits)),
    main === null ? [] : extendHistory((range) => readUnits(git, repo, since, range), main, historyOf(previous?.main, previous?.units)),
    previous?.head === head ? previous.lines : readLines(git, repo, head),
  ]);
  if (commits === null || units === null || lines === null) return null;
  const scan = { head, main, commits: windowOf(commits, since), units: windowOf(units, since), lines };
  return previous !== undefined && isSameScan(previous, scan) ? previous : scan;
}

export function repoCodeOf(scan: RepoScan): RepoCode {
  return { commits: scan.commits.map(({ paths }) => paths), lines: scan.lines, units: scan.units };
}

type History<T> = { tip: string; entries: T[] };

function historyOf<T>(tip: string | null | undefined, entries: T[] | undefined): History<T> | undefined {
  return tip === undefined || tip === null || entries === undefined ? undefined : { tip, entries };
}

async function extendHistory<T>(read: (range: HistoryRange) => Promise<HistoryRead<T> | null>, tip: string, previous: History<T> | undefined): Promise<T[] | null> {
  if (previous?.tip === tip) return previous.entries;
  if (previous !== undefined) {
    const added = await read({ tip, after: previous.tip });
    if (added?.reachesAfter === true) return [...added.entries, ...previous.entries];
  }
  return (await read({ tip }))?.entries ?? null;
}

function windowOf<T extends { date: string }>(entries: readonly T[], since: Date): T[] {
  return entries.filter((entry) => Date.parse(entry.date) >= since.getTime()).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function isSameScan(previous: RepoScan, scan: RepoScan): boolean {
  return (
    previous.head === scan.head &&
    previous.main === scan.main &&
    previous.commits.length === scan.commits.length &&
    previous.units.length === scan.units.length
  );
}
