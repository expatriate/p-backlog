import { mkdir, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { DAY_MS, STATS_HISTORY_DAYS } from "../model/lifecycle";
import { withFileLock } from "./file-lock";
import { appendJsonLines, parseJson, readAt, readJsonLines, toJsonLines, withExistingFile, writeFileAtomic } from "./fs-utils";

export const RUNS_FILE = ".runs.jsonl";

const RUNS_KEPT_DAYS = STATS_HISTORY_DAYS;
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

export async function readRuns(root: string): Promise<readonly CliRun[]> {
  return (await readJsonLines(join(root, RUNS_FILE), cliRunSchema)).values;
}

export async function trimRuns(root: string, now: Date): Promise<number> {
  const path = join(root, RUNS_FILE);
  return withFileLock(path, async () => {
    const { values: runs, invalidLines } = await readJsonLines(path, cliRunSchema);
    const cutoff = now.getTime() - RUNS_KEPT_DAYS * DAY_MS;
    const kept = runs.filter((run) => Date.parse(run.at) >= cutoff);
    const removed = runs.length - kept.length + invalidLines;
    if (removed > 0) await writeFileAtomic(path, toJsonLines(kept));
    return removed;
  });
}

export async function trimRunsWhenStale(root: string, now: Date): Promise<number> {
  const first = await firstRun(join(root, RUNS_FILE));
  const staleBefore = now.getTime() - (RUNS_KEPT_DAYS + STALE_RUN_SLACK_DAYS) * DAY_MS;
  const needsTrim = first === "unparsable" || (typeof first === "number" && first < staleBefore);
  return needsTrim ? trimRuns(root, now) : 0;
}

type FirstRun = "none" | "unparsable" | number;

async function firstRun(path: string): Promise<FirstRun> {
  return (await withExistingFile(path, firstRunIn)) ?? "none";
}

async function firstRunIn(handle: FileHandle): Promise<FirstRun> {
  const [firstLine = ""] = (await readAt(handle, 0, FIRST_LINE_BYTES)).toString("utf8").split("\n");
  if (firstLine.trim() === "") return "none";
  const run = parseJson(firstLine, cliRunSchema);
  return run === null ? "unparsable" : Date.parse(run.at);
}
