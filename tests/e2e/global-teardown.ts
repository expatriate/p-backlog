import { rm } from "node:fs/promises";
import { E2E_BACKLOG_DIR, E2E_HOME } from "./backlog-dir";

export default async function globalTeardown(): Promise<void> {
  await rm(E2E_BACKLOG_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(E2E_HOME, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
