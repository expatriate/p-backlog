import { mkdir, rm } from "node:fs/promises";
import { E2E_BACKLOG_DIR } from "./backlog-dir";

export default async function globalSetup(): Promise<void> {
  await rm(E2E_BACKLOG_DIR, { recursive: true, force: true });
  await mkdir(E2E_BACKLOG_DIR, { recursive: true });
}
