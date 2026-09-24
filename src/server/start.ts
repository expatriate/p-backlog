import { errorText } from "../core/errors";
import { serve } from "@hono/node-server";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { claudeProjectsDir } from "../core/claude-dir";
import { coreMessages } from "../core/messages";
import { trimRuns } from "../core/store/runs";
import { settingsFilePath, settledLanguage } from "../core/store/settings";
import { sweepClosed, type SweepReport } from "../core/store/sweep";
import { createApp } from "./app";
import { CHANGE_DEBOUNCE_MS, createChangeFeed } from "./change-feed";
import { localHosts } from "./guards";
import { serverLanguage, serverMessages } from "./messages";
import { createMemorySampler } from "./memory-sampler";
import { listenFailure } from "./port";
import { startSweeper } from "./sweeper";
import { createUsageScanner } from "./usage-scanner";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export type RunningServer = { port: number; close: () => Promise<void> };

export type StartServerOptions = { root: string; port: number; home: string; env: NodeJS.ProcessEnv; pidFile?: string | undefined };

export async function startServer({ root, port, home, env, pidFile }: StartServerOptions): Promise<RunningServer> {
  await mkdir(root, { recursive: true });

  const settled = await settledLanguage(root, env);
  const startupMessages = serverMessages(settled.language);
  if (settled.invalidSettingsFile) process.stderr.write(`${startupMessages.settingsFileInvalid(settingsFilePath(root))}\n`);

  const readMessages = () => serverLanguage(root).then(serverMessages);
  const usage = createUsageScanner({ root, claudeProjectsDir: claudeProjectsDir(env, home), messages: readMessages });
  const memory = createMemorySampler();
  const changes = createChangeFeed(root, CHANGE_DEBOUNCE_MS, readMessages);
  const hostsForActualPort = new Set<string>();

  const app = createApp({ root, changes, allowedHosts: hostsForActualPort, home, usage, memory, staticDir: join(import.meta.dirname, "web") });

  usage.start();
  memory.start();

  const sweepAll = async (now: Date): Promise<SweepReport> => {
    const language = await serverLanguage(root);
    await trimRuns(root, now).catch((error: unknown) => process.stderr.write(`${serverMessages(language).runsTrimFailed(errorText(error))}\n`));
    return sweepClosed(root, now, coreMessages(language));
  };

  const stopSweeper = startSweeper({
    sweep: () => sweepAll(new Date()),
    intervalMs: SWEEP_INTERVAL_MS,
    log: (line) => process.stdout.write(`${line}\n`),
    warn: (line) => process.stderr.write(`${line}\n`),
    messages: readMessages,
  });

  const stopBackground = async (): Promise<void> => {
    await usage.stop();
    memory.stop();
    await stopSweeper();
  };

  return new Promise<RunningServer>((resolve, reject) => {
    let listening = false;
    let decided = false;

    const closeServer = (): Promise<void> => new Promise((resolveClose, rejectClose) => server.close((error) => (error ? rejectClose(error) : resolveClose())));

    const teardown = async (): Promise<void> => {
      await stopBackground();
      await changes.close();
      if (pidFile !== undefined) await rm(pidFile, { force: true });
      if (listening) await closeServer();
    };

    const finish = async (actualPort: number): Promise<void> => {
      if (pidFile !== undefined) await writeFile(pidFile, String(process.pid));
      if (decided) return;
      decided = true;
      resolve({ port: actualPort, close: teardown });
    };

    const failStartup = async (error: unknown): Promise<void> => {
      decided = true;
      await teardown();
      reject(error);
    };

    const reportErrorAfterStartup = (error: unknown): void => {
      process.stderr.write(`${errorText(error)}\n`);
    };

    const onPidFileError = (error: unknown): void => {
      if (decided) reportErrorAfterStartup(error);
      else void failStartup(error);
    };

    const onSocketError = (error: NodeJS.ErrnoException): void => {
      if (decided) reportErrorAfterStartup(error);
      else void failStartup(new Error(listenFailure(error, port, startupMessages)));
    };

    const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, (info) => {
      listening = true;
      for (const host of localHosts(info.port)) hostsForActualPort.add(host);
      process.stdout.write(startupMessages.serverStarted(info.port, root));
      void finish(info.port).catch(onPidFileError);
    });

    server.on("error", onSocketError);
  });
}
