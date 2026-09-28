import { join } from "node:path";
import { z } from "zod";
import { markShown, type SignalsShown } from "../stats/signals/shown";
import type { Signal } from "../stats/types";
import { withFileLock } from "./file-lock";
import { readJsonFile, writeJsonFile } from "./fs-utils";

export const SIGNALS_SHOWN_FILE = ".signals-shown.json";

const shownSchema = z.record(z.string(), z.string());

export async function readSignalsShown(projectDir: string): Promise<SignalsShown> {
  return (await readJsonFile(join(projectDir, SIGNALS_SHOWN_FILE), shownSchema)) ?? {};
}

export async function rememberSignalsShown(projectDir: string, signals: readonly Signal[], today: string): Promise<void> {
  const path = join(projectDir, SIGNALS_SHOWN_FILE);
  await withFileLock(path, async () => writeJsonFile(path, markShown(await readSignalsShown(projectDir), signals, today)));
}
