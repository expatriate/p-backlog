import { join } from "node:path";
import { z } from "zod";
import type { SignalsShown } from "../stats/signals/shown";
import { readJsonFile, writeJsonFile } from "./fs-utils";

export const SIGNALS_SHOWN_FILE = ".signals-shown.json";

const shownSchema = z.record(z.string(), z.string());

export async function readSignalsShown(projectDir: string): Promise<SignalsShown> {
  return (await readJsonFile(join(projectDir, SIGNALS_SHOWN_FILE), shownSchema)) ?? {};
}

export async function writeSignalsShown(projectDir: string, shown: SignalsShown): Promise<void> {
  await writeJsonFile(join(projectDir, SIGNALS_SHOWN_FILE), shown);
}
