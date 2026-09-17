import { tmpdir } from "node:os";
import { join } from "node:path";

const runId = (process.env.E2E_RUN_ID ??= String(process.pid));

export const E2E_PORT = Number(process.env.E2E_PORT ?? 4318);
export const E2E_BACKLOG_DIR = join(tmpdir(), `p-backlog-e2e-${runId}`);
