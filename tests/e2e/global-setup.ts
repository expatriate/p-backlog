import { mkdir } from "node:fs/promises";
import { writeSettings } from "../../src/core/store/settings";
import { E2E_BACKLOG_DIR, E2E_HOME } from "./backlog-dir";

export default async function globalSetup(): Promise<void> {
  await mkdir(E2E_BACKLOG_DIR, { recursive: true });
  await mkdir(E2E_HOME, { recursive: true });
  await writeSettings(E2E_BACKLOG_DIR, { language: "ru" });
}
