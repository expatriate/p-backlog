import { join } from "node:path";
import { z } from "zod";
import type { SignalsShown } from "../stats/signals/shown";
import { readTextOrNull, writeFileAtomic } from "./fs-utils";

export const SIGNALS_SHOWN_FILE = "signals-shown.json";

const shownSchema = z.record(z.string(), z.string());

export async function readSignalsShown(projectDir: string): Promise<SignalsShown> {
  try {
    const text = await readTextOrNull(join(projectDir, SIGNALS_SHOWN_FILE));
    if (text === null) return {};
    const parsed = shownSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function writeSignalsShown(projectDir: string, shown: SignalsShown): Promise<void> {
  await writeFileAtomic(join(projectDir, SIGNALS_SHOWN_FILE), `${JSON.stringify(shown, null, 2)}\n`);
}
