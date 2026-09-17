import { mkdir } from "node:fs/promises";
import { E2E_BACKLOG_DIR } from "./backlog-dir";

export default async function globalSetup(): Promise<void> {
  await mkdir(E2E_BACKLOG_DIR, { recursive: true });
}
