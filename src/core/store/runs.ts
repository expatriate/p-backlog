import { appendFile, mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { DAY_MS } from "../model/lifecycle";
import { withFileLock } from "./file-lock";
import { hasErrorCode, parseJson, readJsonLines, toJsonLines, writeFileAtomic } from "./fs-utils";

export const RUNS_FILE = ".runs.jsonl";

const RUNS_KEPT_DAYS = 30;
const STALE_RUN_SLACK_DAYS = 1;
const FIRST_LINE_BYTES = 4096;

const cliRunSchema = z.object({
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
  await withFileLock(path, () => appendFile(path, toJsonLines([run]), "utf8"));
}

export async function readRuns(root: string): Promise<CliRun[]> {
  return (await readJsonLines(join(root, RUNS_FILE), cliRunSchema)).values;
}

export async function trimRuns(root: string, now: Date): Promise<number> {
  const path = join(root, RUNS_FILE);
  return withFileLock(path, async () => {
    const runs = await readRuns(root);
    const cutoff = now.getTime() - RUNS_KEPT_DAYS * DAY_MS;
    const kept = runs.filter((run) => Date.parse(run.at) >= cutoff);
    const removed = runs.length - kept.length;
    if (removed > 0) await writeFileAtomic(path, toJsonLines(kept));
    return removed;
  });
}

export async function trimRunsWhenStale(root: string, now: Date): Promise<number> {
  const oldest = await oldestRunAt(join(root, RUNS_FILE));
  const staleBefore = now.getTime() - (RUNS_KEPT_DAYS + STALE_RUN_SLACK_DAYS) * DAY_MS;
  return oldest !== null && oldest < staleBefore ? trimRuns(root, now) : 0;
}

async function oldestRunAt(path: string): Promise<number | null> {
  const file = await open(path, "r").catch((error: unknown) => {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  });
  if (file === null) return null;
  try {
    const { buffer, bytesRead } = await file.read(Buffer.alloc(FIRST_LINE_BYTES), 0, FIRST_LINE_BYTES, 0);
    const [firstLine = ""] = buffer.toString("utf8", 0, bytesRead).split("\n");
    const run = parseJson(firstLine, cliRunSchema);
    return run === null ? null : Date.parse(run.at);
  } finally {
    await file.close();
  }
}
