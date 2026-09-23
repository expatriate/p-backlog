import { errorText } from "../core/errors";
import { sum } from "../core/stats/numbers";
import type { ScanProgress } from "../core/stats/types";
import { listTranscripts, scanTranscripts, type TranscriptFile } from "../core/usage/transcripts";
import { emptyUsageCache, readUsageCache, writeUsageCache, type UsageCache } from "../core/usage/usage-cache";
import { serverRu, type ServerMessages } from "./messages.ru";

export type UsageScannerOptions = { root: string; claudeProjectsDir: string; byteBudget?: number; intervalMs?: number; messages?: ServerMessages };

export type UsageScanner = {
  start: () => void;
  stop: () => void;
  scanOnce: () => Promise<void>;
  ensureStarted: () => void;
  snapshot: () => { cache: UsageCache; scan: ScanProgress };
};

const DEFAULT_BYTE_BUDGET = 16 * 1024 * 1024;
const DEFAULT_INTERVAL_MS = 60_000;
export const CATCH_UP_DELAY_MS = 100;
const NOT_LISTED: ScanProgress = { listed: false, filesTotal: 0, filesDone: 0, bytesLeft: 0 };

export function createUsageScanner({ root, claudeProjectsDir, byteBudget = DEFAULT_BYTE_BUDGET, intervalMs = DEFAULT_INTERVAL_MS, messages = serverRu }: UsageScannerOptions): UsageScanner {
  let cache: UsageCache | null = null;
  let scan: ScanProgress = NOT_LISTED;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let budgetExhausted = false;

  const runPass = async (): Promise<void> => {
    const current = cache ?? (await readUsageCache(root));
    const files = await listTranscripts(claudeProjectsDir);
    scan = progressBefore(files, current);
    const result = await scanTranscripts({ files, cache: current, byteBudget });
    cache = result.cache;
    scan = { listed: true, filesTotal: files.length, filesDone: result.filesDone, bytesLeft: result.bytesLeft };
    budgetExhausted = result.bytesRead >= byteBudget;
    if (result.bytesRead > 0) await writeUsageCache(root, result.cache);
  };

  const scanOnce = (): Promise<void> => {
    inFlight ??= runPass()
      .catch((error: unknown) => {
        budgetExhausted = false;
        process.stderr.write(`${messages.transcriptsScanFailed(errorText(error))}\n`);
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const tick = async (): Promise<void> => {
    await scanOnce();
    if (running) timer = setTimeout(() => void tick(), budgetExhausted ? CATCH_UP_DELAY_MS : intervalMs);
  };

  return {
    start: () => {
      running = true;
      void tick();
    },
    stop: () => {
      running = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
    scanOnce,
    ensureStarted: () => {
      if (!scan.listed && inFlight === null) void scanOnce();
    },
    snapshot: () => ({ cache: cache ?? emptyUsageCache(), scan }),
  };
}

function progressBefore(files: readonly TranscriptFile[], cache: UsageCache): ScanProgress {
  const offsetOf = (file: TranscriptFile) => {
    const cached = cache.files[file.path];
    return cached !== undefined && file.size >= cached.size ? cached.offset : 0;
  };
  return {
    listed: true,
    filesTotal: files.length,
    filesDone: files.filter((file) => offsetOf(file) === file.size).length,
    bytesLeft: sum(files.map((file) => file.size - offsetOf(file))),
  };
}
