import { mkdir, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { withFileLock } from "./file-lock";
import { appendJsonLines, parseJson, readAt, readJsonLines, toJsonLines, withExistingFile, writeFileAtomic } from "./fs-utils";
import { DAY_MS } from "../model/dates";
import { retainedSince } from "../model/history-window";

export const RUNS_FILE = ".runs.jsonl";

const STALE_RUN_SLACK_DAYS = 1;
const FIRST_LINE_BYTES = 4096;

export const cliRunSchema = z.object({
  at: z.iso.datetime({ offset: true }),
  command: z.string().min(1),
  cwd: z.string().min(1),
  ms: z.number(),
  rssMb: z.number(),
  exitCode: z.number(),
});

export type CliRun = z.infer<typeof cliRunSchema>;

export async function appendRun(root: string, run: CliRun): Promise<void> {
  await mkdir(root, { recursive: true });
  const path = join(root, RUNS_FILE);
  await withFileLock(path, () => appendJsonLines(path, [run]));
}

export async function trimRuns(root: string, now: Date): Promise<number> {
  const path = join(root, RUNS_FILE);
  return withFileLock(path, async () => {
    const { values: runs, invalidLines } = await readJsonLines(path, cliRunSchema);
    const cutoff = retainedSince(now);
    const kept = runs.filter((run) => Date.parse(run.at) >= cutoff);
    const removed = runs.length - kept.length + invalidLines;
    if (removed > 0) await writeFileAtomic(path, toJsonLines(kept));
    return removed;
  });
}

export async function trimRunsWhenStale(root: string, now: Date): Promise<number> {
  const first = await firstRun(join(root, RUNS_FILE));
  const staleBefore = retainedSince(now) - STALE_RUN_SLACK_DAYS * DAY_MS;
  const needsTrim = first.kind === "unparsable" || (first.kind === "run" && first.at < staleBefore);
  return needsTrim ? trimRuns(root, now) : 0;
}

type FirstRun = { kind: "none" } | { kind: "unparsable" } | { kind: "run"; at: number };

const NO_RUN: FirstRun = { kind: "none" };

async function firstRun(path: string): Promise<FirstRun> {
  return (await withExistingFile(path, firstRunIn)) ?? NO_RUN;
}

async function firstRunIn(handle: FileHandle): Promise<FirstRun> {
  const [firstLine = ""] = (await readAt(handle, 0, FIRST_LINE_BYTES)).toString("utf8").split("\n");
  if (firstLine.trim() === "") return NO_RUN;
  const run = parseJson(firstLine, cliRunSchema);
  return run === null ? { kind: "unparsable" } : { kind: "run", at: Date.parse(run.at) };
}
