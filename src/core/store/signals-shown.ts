import { join } from "node:path";
import { z } from "zod";
import { markShown, type SignalsShown } from "../stats/signals/shown";
import type { Signal } from "../stats/types";
import { readJsonFile } from "./fs-utils";
import { updateJsonUnderLock } from "./json-under-lock";

export const SIGNALS_SHOWN_FILE = ".signals-shown.json";

const shownSchema = z.record(z.string(), z.string());

export async function readSignalsShown(projectDir: string): Promise<SignalsShown> {
  return (await readJsonFile(join(projectDir, SIGNALS_SHOWN_FILE), shownSchema)) ?? {};
}

export async function rememberSignalsShown(projectDir: string, signals: readonly Signal[], today: string): Promise<void> {
  await updateJsonUnderLock(join(projectDir, SIGNALS_SHOWN_FILE), shownSchema, {}, (shown) => markShown(shown, signals, today));
}
