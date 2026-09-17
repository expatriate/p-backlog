import { tmpdir } from "node:os";
import { join } from "node:path";

export const E2E_PORT = 4318;
export const E2E_BACKLOG_DIR = join(tmpdir(), "p-backlog-e2e");
