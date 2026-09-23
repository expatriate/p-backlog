import { errorText } from "../core/errors";
import { serve } from "@hono/node-server";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { coreMessages } from "../core/messages";
import { resolveBacklogRoot } from "../core/store/paths";
import { trimRuns } from "../core/store/runs";
import { settingsFilePath, settledLanguage } from "../core/store/settings";
import { sweepClosed, type SweepReport } from "../core/store/sweep";
import { createApp } from "./app";
import { CHANGE_DEBOUNCE_MS, createChangeFeed } from "./change-feed";
import { localHosts } from "./guards";
import { serverLanguage, serverMessages } from "./messages";
import { createMemorySampler } from "./memory-sampler";
import { listenFailure, readPort } from "./port";
import { startSweeper } from "./sweeper";
import { createUsageScanner } from "./usage-scanner";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

const home = homedir();
const root = resolveBacklogRoot(process.env, home);
const port = readPort(process.env.PORT);

await mkdir(root, { recursive: true });

const settledStartupLanguage = await settledLanguage(root, process.env);
const startupMessages = serverMessages(settledStartupLanguage.language);
if (settledStartupLanguage.invalidSettingsFile) process.stderr.write(`${startupMessages.settingsFileInvalid(settingsFilePath(root))}\n`);

const readMessages = () => serverLanguage(root).then(serverMessages);
const usage = createUsageScanner({ root, claudeProjectsDir: join(home, ".claude", "projects"), messages: readMessages });
const memory = createMemorySampler();

const app = createApp({
  root,
  changes: createChangeFeed(root, CHANGE_DEBOUNCE_MS, readMessages),
  allowedHosts: localHosts(port),
  home,
  usage,
  memory,
  staticDir: join(import.meta.dirname, "web"),
});

usage.start();
memory.start();

const sweepAll = async (now: Date): Promise<SweepReport> => {
  const language = await serverLanguage(root);
  await trimRuns(root, now).catch((error: unknown) => process.stderr.write(`${serverMessages(language).runsTrimFailed(errorText(error))}\n`));
  return sweepClosed(root, now, coreMessages(language));
};

startSweeper({
  sweep: () => sweepAll(new Date()),
  intervalMs: SWEEP_INTERVAL_MS,
  log: (line) => process.stdout.write(`${line}\n`),
  warn: (line) => process.stderr.write(`${line}\n`),
  messages: readMessages,
});

const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () => {
  process.stdout.write(startupMessages.serverStarted(port, root));
});

server.on("error", (error: NodeJS.ErrnoException) => {
  process.stderr.write(`${listenFailure(error, port, startupMessages)}\n`);
  process.exit(1);
});
