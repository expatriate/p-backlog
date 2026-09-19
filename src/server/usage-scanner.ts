import type { Project } from "../core/model/types";
import type { ScanProgress } from "../core/stats/types";
import { loadBacklog } from "../core/store/load";
import { findProjectForDir } from "../core/store/resolve-project";
import { listTranscripts, scanTranscripts } from "../core/usage/transcripts";
import { emptyUsageCache, readUsageCache, writeUsageCache, type UsageCache } from "../core/usage/usage-cache";

export type UsageScannerOptions = { root: string; claudeProjectsDir: string; home: string; byteBudget?: number; intervalMs?: number };

export type UsageScanner = {
  start: () => void;
  stop: () => void;
  scanOnce: (projects: readonly Project[]) => Promise<void>;
  ensureStarted: (projects: readonly Project[]) => void;
  snapshot: () => { cache: UsageCache; scan: ScanProgress };
};

const DEFAULT_BYTE_BUDGET = 200 * 1024 * 1024;
const DEFAULT_INTERVAL_MS = 60_000;
const EMPTY_SCAN: ScanProgress = { filesTotal: 0, filesDone: 0, bytesLeft: 0 };

export function createUsageScanner({ root, claudeProjectsDir, home, byteBudget = DEFAULT_BYTE_BUDGET, intervalMs = DEFAULT_INTERVAL_MS }: UsageScannerOptions): UsageScanner {
  let cache: UsageCache = emptyUsageCache();
  let cacheLoaded = false;
  let scan: ScanProgress = EMPTY_SCAN;
  let started = false;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const runPass = async (projects: readonly Project[]): Promise<void> => {
    if (!cacheLoaded) {
      cache = await readUsageCache(root);
      cacheLoaded = true;
    }
    const files = await listTranscripts(claudeProjectsDir);
    const projectOf = (cwd: string): string | null => findProjectForDir(projects, cwd, home)?.id ?? null;
    const result = await scanTranscripts({ files, cache, projectOf, byteBudget });
    cache = result.cache;
    scan = { filesTotal: files.length, filesDone: result.filesDone, bytesLeft: result.bytesLeft };
    await writeUsageCache(root, cache);
  };

  const scanOnce = (projects: readonly Project[]): Promise<void> => {
    started = true;
    if (inFlight !== null) return inFlight;
    inFlight = runPass(projects)
      .catch((error: unknown) => {
        process.stderr.write(`Не удалось прочитать расшифровки Claude Code: ${error instanceof Error ? error.message : String(error)}\n`);
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const scanFromTimer = (): void => {
    void loadBacklog(root).then(({ projects }) => scanOnce(projects));
  };

  return {
    start: () => {
      scanFromTimer();
      timer = setInterval(scanFromTimer, intervalMs);
    },
    stop: () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    scanOnce,
    ensureStarted: (projects) => {
      if (!started) void scanOnce(projects);
    },
    snapshot: () => ({ cache, scan }),
  };
}
