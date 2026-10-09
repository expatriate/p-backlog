import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { mkdir, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { claudeProjectsDir } from "../core/claude-dir";
import { HOUR_MS } from "../core/model/dates";
import { errorText } from "../core/errors";
import type { Language } from "../core/i18n/language";
import { coreMessages } from "../core/messages";
import { browserOrigin, LOOPBACK_HOST } from "../core/server-address";
import { settleLanguageReportingProblems } from "../core/settle-language";
import { serviceLogToTrim } from "../core/service-log";
import { compactJournalsWhenDue } from "../core/store/journal-compaction";
import { runMaintenance, type MaintenancePlan } from "../core/store/maintenance";
import { trimRuns } from "../core/store/runs";
import { readLanguageOrLocale } from "../core/store/settings";
import { sweepClosedAndStamp, type SweepReport } from "../core/store/sweep";
import { createApp } from "./app";
import { CHANGE_DEBOUNCE_MS, createChangeFeed } from "./change-feed";
import { localHosts } from "./guards";
import { createMemorySampler, type MemorySampler } from "./memory-sampler";
import { localizedWarn, serverMessages, type ServerMessages } from "./messages";
import { listenFailure } from "./port";
import { startSweeper } from "./sweeper";
import { createUsageScanner, type UsageScanner } from "./usage-scanner";

const SWEEP_INTERVAL_MS = HOUR_MS;
const STOP_SIGNALS: readonly NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGHUP"];

export const BUNDLED_WEB_DIR = join(import.meta.dirname, "web");

export type RunningServer = { port: number; close: () => Promise<void> };

type ServerOutput = { log: (line: string) => void; warn: (line: string) => void };

export type StartServerOptions = ServerOutput & {
  root: string;
  port: number;
  home: string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  pidFile?: string | undefined;
  staticDir?: string | undefined;
  settledLanguage?: Language | undefined;
  now?: () => Date;
};

type HttpServer = ReturnType<typeof serve>;

type Listening = { server: HttpServer; port: number };

type BackgroundJobs = ServerOutput & { usage: UsageScanner; memory: MemorySampler; maintain: () => Promise<SweepReport | null>; messages: () => Promise<ServerMessages> };

export async function startServer({ root, port, home, env, platform, log, warn, pidFile, staticDir, settledLanguage, now = () => new Date() }: StartServerOptions): Promise<RunningServer> {
  await mkdir(root, { recursive: true });

  const startupMessages = serverMessages(settledLanguage ?? (await settleLanguageReportingProblems(root, env, warn)));

  const readLanguage = () => readLanguageOrLocale(root, env);
  const readMessages = () => readLanguage().then(serverMessages);
  const warnLocalized = localizedWarn(readLanguage, warn);
  const usage = createUsageScanner({ root, claudeProjectsDir: claudeProjectsDir(env, home), warn: warnLocalized, now });
  const memory = createMemorySampler({ now });
  const changes = createChangeFeed({ root, debounceMs: CHANGE_DEBOUNCE_MS, warn: warnLocalized });
  const allowedHosts = new Set<string>();
  const app = createApp({ root, readLanguage, changes, allowedHosts, home, statsServices: { usage, memory, warn: warnLocalized }, staticDir, now });

  const maintenancePlan: MaintenancePlan = { trimRuns, sweepClosed: sweepClosedAndStamp, compactJournals: compactJournalsWhenDue, serviceLog: serviceLogToTrim(platform, home) };
  const maintain = async (): Promise<SweepReport | null> => runMaintenance(maintenancePlan, { root, now: now(), messages: coreMessages(await readLanguage()), warn });

  const { server, port: actualPort } = await listen(app, port).catch(async (error: NodeJS.ErrnoException) => {
    await changes.close();
    throw new Error(listenFailure(error, port, startupMessages));
  });
  server.on("error", (error) => warn(errorText(error)));
  for (const host of localHosts(actualPort)) allowedHosts.add(host);
  const stopBackground = startBackground({ usage, memory, maintain, messages: readMessages, log, warn });

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
  log(startupMessages.serverStarted(browserOrigin(actualPort), root));
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
    const server = serve({ fetch: app.fetch, hostname: LOOPBACK_HOST, port }, (info) => {
      server.off("error", reject);
      resolve({ server, port: info.port });
    });
    server.once("error", reject);
    server.on("request", (_request: IncomingMessage, response: ServerResponse) => response.on("finish", () => dropIdleWhenClosing(server)));
  });
}

function dropIdleWhenClosing(server: HttpServer): void {
  if (server.listening || !("closeIdleConnections" in server)) return;
  setImmediate(() => server.closeIdleConnections());
}

function closeServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function startBackground({ usage, memory, maintain, messages, log, warn }: BackgroundJobs): () => Promise<void> {
  usage.start();
  memory.start();
  const stopSweeper = startSweeper({ maintain, intervalMs: SWEEP_INTERVAL_MS, log, warn, messages });
  return async () => {
    await usage.stop();
    memory.stop();
    await stopSweeper();
  };
}
