import { FIELD, RECORD, resolveCommits, type GitRunner } from "../git/run";
import { CHURN_EXCLUDES, numstatLines, records } from "./git-code";
import { isTestPath } from "./test-paths";
import type { FixCommit } from "./types";

const AGENT_TRAILER = /^claude/i;
const RENAME_ARROW = " => ";
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
// git log --extended-regexp is POSIX ERE: no \s, \d or (?:), so classes are spelled [[:space:]] and [0-9].
const LIST_BULLET = "([*-][[:space:]]+)?";
const PULL_REQUEST_SUFFIX = "([[:space:]]*\\(#[0-9]+\\))?";

export type FixCommitsRequest = { hashes: readonly string[]; mainCommit: string | null };

export async function readFixCommits(git: GitRunner, repo: string, { hashes, mainCommit }: FixCommitsRequest): Promise<Map<string, FixCommit> | null> {
  const fullHashes = await resolveCommits(git, repo, hashes);
  if (fullHashes === null) return null;
  return fullHashes.size === 0 ? new Map() : readFixBatch(git, repo, fullHashes, mainCommit);
}

type FixHeader = { full: string; date: string; subject: string; byAgent: boolean };

type FixChanges = { lines: number; testLines: number; paths: string[] };

type LandingQuestion = { fix: FixHeader; paths: readonly string[]; mainCommit: string };

async function readFixBatch(git: GitRunner, repo: string, fullHashes: ReadonlyMap<string, string>, mainCommit: string | null): Promise<Map<string, FixCommit> | null> {
  const commits = [...new Set(fullHashes.values())];
  const [headers, stats] = await Promise.all([
    git(repo, ["log", "--no-walk=unsorted", ...commits, `--format=tformat:${RECORD}%H${FIELD}%cI${FIELD}%s${FIELD}%(trailers:key=Co-authored-by,valueonly,separator=${FIELD})`, "--"]),
    git(repo, ["log", "--no-walk=unsorted", ...commits, `--format=tformat:${RECORD}%H`, "--numstat", "--diff-merges=first-parent", "--relative", "--", ".", ...CHURN_EXCLUDES]),
  ]);
  if (headers === null || stats === null) return null;
  const changedLines = new Map(parseFixStats(stats));
  const byFullHash = new Map(
    await Promise.all(
      parseFixHeaders(headers).map(async (header): Promise<[string, FixCommit]> => {
        const { lines, testLines, paths } = changedLines.get(header.full) ?? { lines: 0, testLines: 0, paths: [] };
        const landedAt = mainCommit === null ? undefined : await landingDate(git, repo, { fix: header, paths, mainCommit });
        return [header.full, { date: header.date, byAgent: header.byAgent, lines, testLines, ...(landedAt === undefined ? {} : { landedAt }) }];
      }),
    ),
  );
  return new Map(
    [...fullHashes].flatMap(([hash, full]): [string, FixCommit][] => {
      const commit = byFullHash.get(full);
      return commit === undefined ? [] : [[hash, commit]];
    }),
  );
}

function parseFixHeaders(output: string): FixHeader[] {
  return records(output).map((record) => {
    const [full = "", date = "", subject = "", ...trailers] = record.split("\n")[0]?.split(FIELD) ?? [];
    return { full, date, subject, byAgent: trailers.some((trailer) => AGENT_TRAILER.test(trailer.trim())) };
  });
}

async function landingDate(git: GitRunner, repo: string, { fix, paths, mainCommit }: LandingQuestion): Promise<string | undefined> {
  if (fix.full === mainCommit) return fix.date;
  const descendants = await git(repo, ["log", "--first-parent", "--ancestry-path", `--format=tformat:%P${FIELD}%cI`, `${fix.full}..${mainCommit}`, "--"]);
  const [parents = "", mergedAt = ""] = lastLine(descendants).split(FIELD);
  if (mergedAt !== "") return parents.split(" ")[0] === fix.full ? fix.date : mergedAt;
  if (fix.subject === "" || paths.length === 0) return undefined;
  const pathspecs = paths.map((path) => `:(literal)${path}`);
  const squashes = await git(repo, ["log", mainCommit, "--first-parent", `--since=${fix.date}`, "--extended-regexp", `--grep=${subjectLinePattern(fix.subject)}`, "--format=tformat:%cI", "--", ...pathspecs]);
  return lastLine(squashes) || undefined;
}

function subjectLinePattern(subject: string): string {
  const escaped = subject.replace(REGEX_SPECIAL, "\\$&");
  return `^[[:space:]]*${LIST_BULLET}${escaped}${PULL_REQUEST_SUFFIX}[[:space:]]*$`;
}

function lastLine(output: string | null): string {
  return output?.trim().split("\n").at(-1) ?? "";
}

function parseFixStats(output: string): [string, FixChanges][] {
  return records(output).map((record): [string, FixChanges] => {
    const [full = "", ...rows] = record.split("\n");
    const paths = rows.map((row) => row.split("\t")[2] ?? "").filter((path) => path !== "" && !path.includes(RENAME_ARROW));
    return [full.trim(), { lines: numstatLines(rows), testLines: numstatLines(rows.filter((row) => isTestPath(row.split("\t")[2] ?? ""))), paths }];
  });
}
