import { errorText } from "../core/errors";
import { serve } from "@hono/node-server";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveBacklogRoot } from "../core/store/paths";
import { trimRuns } from "../core/store/runs";
import { sweepClosed, type SweepReport } from "../core/store/sweep";
import { createApp } from "./app";
import { createChangeFeed } from "./change-feed";
import { localHosts } from "./guards";
import { createMemorySampler } from "./memory-sampler";
import { listenFailure, readPort } from "./port";
import { startSweeper } from "./sweeper";
import { createUsageScanner } from "./usage-scanner";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

const home = homedir();
const root = resolveBacklogRoot(process.env, home);
const port = readPort(process.env.PORT);

await mkdir(root, { recursive: true });

const usage = createUsageScanner({ root, claudeProjectsDir: join(home, ".claude", "projects") });
const memory = createMemorySampler();

const app = createApp({
  root,
  changes: createChangeFeed(root),
  allowedHosts: localHosts(port),
  home,
  usage,
  memory,
  staticDir: join(import.meta.dirname, "web"),
});

usage.start();
memory.start();

const sweepAll = async (now: Date): Promise<SweepReport> => {
  await trimRuns(root, now).catch((error: unknown) => process.stderr.write(`Не удалось обрезать журнал запусков: ${errorText(error)}\n`));
  return sweepClosed(root, now);
};

startSweeper({
  sweep: () => sweepAll(new Date()),
  intervalMs: SWEEP_INTERVAL_MS,
  log: (line) => process.stdout.write(`${line}\n`),
  warn: (line) => process.stderr.write(`${line}\n`),
});

const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () => {
  process.stdout.write(`p-backlog: http://localhost:${port}\nКаталог беклога: ${root}\n`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  process.stderr.write(`${listenFailure(error, port)}\n`);
  process.exit(1);
});
