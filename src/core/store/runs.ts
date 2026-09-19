import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { readTextOrNull } from "./fs-utils";

export const RUNS_FILE = ".runs.jsonl";

export type CliRun = { at: string; command: string; cwd: string; ms: number; rssMb: number; exitCode: number };

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

function parseRun(line: string): CliRun | null {
  try {
    const parsed = cliRunSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
