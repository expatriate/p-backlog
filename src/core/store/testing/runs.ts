import { join } from "node:path";
import { readJsonLines } from "../json-lines";
import { cliRunSchema, RUNS_FILE, type CliRun } from "../runs";

export async function readRuns(root: string): Promise<readonly CliRun[]> {
  return (await readJsonLines(join(root, RUNS_FILE), cliRunSchema)).values;
}
