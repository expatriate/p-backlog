import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { CliRun } from "../stats/types";
import { readTextOrNull, writeFileAtomic } from "./fs-utils";

export const RUNS_FILE = ".runs.jsonl";

export type { CliRun } from "../stats/types";

export const RUNS_KEPT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const cliRunSchema = z.object({
  at: z.iso.datetime({ offset: true }),
  command: z.string().min(1),
  cwd: z.string().min(1),
  ms: z.number(),
  rssMb: z.number(),
  exitCode: z.number(),
});

export async function appendRun(root: string, run: CliRun): Promise<void> {
  await mkdir(root, { recursive: true });
  await appendFile(join(root, RUNS_FILE), `${JSON.stringify(run)}\n`, "utf8");
}

export async function readRuns(root: string): Promise<CliRun[]> {
  const text = (await readTextOrNull(join(root, RUNS_FILE))) ?? "";
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map(parseRun)
    .filter((run): run is CliRun => run !== null);
}

export async function trimRuns(root: string, now: Date): Promise<number> {
  const runs = await readRuns(root);
  const cutoff = now.getTime() - RUNS_KEPT_DAYS * DAY_MS;
  const kept = runs.filter((run) => Date.parse(run.at) >= cutoff);
  const removed = runs.length - kept.length;
  if (removed > 0) await writeFileAtomic(join(root, RUNS_FILE), kept.map((run) => `${JSON.stringify(run)}\n`).join(""));
  return removed;
}

function parseRun(line: string): CliRun | null {
  try {
    const parsed = cliRunSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
