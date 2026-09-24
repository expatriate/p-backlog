import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { DAY_MS } from "../model/lifecycle";
import { withFileLock } from "./file-lock";
import { readJsonLines, toJsonLines, writeFileAtomic } from "./fs-utils";

export const RUNS_FILE = ".runs.jsonl";

const RUNS_KEPT_DAYS = 30;

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
