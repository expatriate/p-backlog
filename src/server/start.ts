import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { claudeProjectsDir } from "../core/claude-dir";
import { errorText } from "../core/errors";
import { coreMessages } from "../core/messages";
import { trimRuns } from "../core/store/runs";
import { settingsFilePath, settleLanguage } from "../core/store/settings";
import { sweepClosed, type SweepReport } from "../core/store/sweep";
import { createApp } from "./app";
import { CHANGE_DEBOUNCE_MS, createChangeFeed } from "./change-feed";
import { localHosts } from "./guards";
import { createMemorySampler, type MemorySampler } from "./memory-sampler";
import { serverLanguage, serverMessages, type ServerMessages } from "./messages";
import { listenFailure } from "./port";
import { startSweeper } from "./sweeper";
import { createUsageScanner, type UsageScanner } from "./usage-scanner";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const STOP_SIGNALS: readonly NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

export const PID_FILE_ENV = "P_BACKLOG_PID_FILE";
export const BUNDLED_WEB_DIR = join(import.meta.dirname, "web");

export type RunningServer = { port: number; close: () => Promise<void> };

export type StartServerOptions = { root: string; port: number; home: string; env: NodeJS.ProcessEnv; pidFile?: string | undefined; staticDir?: string | undefined };

type HttpServer = ReturnType<typeof serve>;

type Listening = { server: HttpServer; port: number };

type BackgroundJobs = { usage: UsageScanner; memory: MemorySampler; sweep: () => Promise<SweepReport>; messages: () => Promise<ServerMessages> };

const log = (line: string): void => void process.stdout.write(`${line}\n`);
const warn = (line: string): void => void process.stderr.write(`${line}\n`);

export async function startServer({ root, port, home, env, pidFile, staticDir }: StartServerOptions): Promise<RunningServer> {
  await mkdir(root, { recursive: true });

  const settled = await settleLanguage(root, env);
  const startupMessages = serverMessages(settled.language);
  if (settled.invalidSettingsFile) warn(startupMessages.settingsFileInvalid(settingsFilePath(root)));

  const readLanguage = () => serverLanguage(root, env);
  const readMessages = () => readLanguage().then(serverMessages);
  const usage = createUsageScanner({ root, claudeProjectsDir: claudeProjectsDir(env, home), messages: readMessages, warn });
  const memory = createMemorySampler();
  const changes = createChangeFeed({ root, debounceMs: CHANGE_DEBOUNCE_MS, messages: readMessages, warn });
  const allowedHosts = new Set<string>();
  const app = createApp({ root, readLanguage, changes, allowedHosts, home, usage, memory, warn, staticDir });

  const sweep = async (): Promise<SweepReport> => {
    const now = new Date();
    const language = await readLanguage();
    await trimRuns(root, now).catch((error: unknown) => warn(serverMessages(language).runsTrimFailed(errorText(error))));
    return sweepClosed(root, now, coreMessages(language));
  };

  const { server, port: actualPort } = await listen(app, port).catch(async (error: NodeJS.ErrnoException) => {
    await changes.close();
    throw new Error(listenFailure(error, port, startupMessages));
  });
  server.on("error", (error) => warn(errorText(error)));
  for (const host of localHosts(actualPort)) allowedHosts.add(host);
  const stopBackground = startBackground({ usage, memory, sweep, messages: readMessages });

  const close = async (): Promise<void> => {
    await stopBackground();
    await changes.close();
    await closeServer(server);
    if (pidFile !== undefined) await rm(pidFile, { force: true });
  };

  if (pidFile !== undefined) {
    await writeFile(pidFile, String(process.pid)).catch(async (error: unknown) => {
      await close();
      throw error;
    });
  }
  process.stdout.write(startupMessages.serverStarted(actualPort, root));
  return { port: actualPort, close };
}

export function closeOnStopSignal(server: RunningServer): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const stop = (): void => {
      for (const signal of STOP_SIGNALS) process.off(signal, stop);
      server.close().then(resolve, reject);
    };
    for (const signal of STOP_SIGNALS) process.once(signal, stop);
  });
}

function listen(app: Hono, port: number): Promise<Listening> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, (info) => {
      server.off("error", reject);
      resolve({ server, port: info.port });
    });
    server.once("error", reject);
  });
}

function closeServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function startBackground({ usage, memory, sweep, messages }: BackgroundJobs): () => Promise<void> {
  usage.start();
  memory.start();
  const stopSweeper = startSweeper({ sweep, intervalMs: SWEEP_INTERVAL_MS, log, warn, messages });
  return async () => {
    await usage.stop();
    memory.stop();
    await stopSweeper();
  };
}
