import { mkdir } from "node:fs/promises";
import { E2E_BACKLOG_DIR, E2E_HOME } from "./backlog-dir";

export default async function globalSetup(): Promise<void> {
  await mkdir(E2E_BACKLOG_DIR, { recursive: true });
  await mkdir(E2E_HOME, { recursive: true });
}
