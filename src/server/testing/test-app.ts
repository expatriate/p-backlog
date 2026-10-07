import type { Hono } from "hono";
import { onTestFinished } from "vitest";
import type { Language } from "../../core/i18n/language";
import type { Task } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { readLanguageOrLocale, writeSettings } from "../../core/store/settings";
import { makeTempDir, projectFile, taskFile, writeFiles } from "../../core/store/testing/temp-dirs";
import { createApp } from "../app";
import type { ChangeFeed, ChangeListener } from "../change-feed";
import { createMemorySampler, type MemorySampler } from "../memory-sampler";
import { createUsageScanner, type UsageScanner } from "../usage-scanner";

const TEST_HOST = "localhost:4317";
export const TEST_NOW = new Date("2026-09-18T12:00:00Z");

export type TestAppOptions = { staticDir?: string; transcriptsDir?: string; language?: Language };

export type TestApp = {
  root: string;
  app: Hono;
  usage: UsageScanner;
  memory: MemorySampler;
  emitChange: (paths?: readonly string[]) => Promise<void>;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  json: (path: string, method: "POST" | "PATCH" | "DELETE", body: unknown) => Promise<Response>;
  taskOnDisk: (id: string) => Promise<Task>;
  taskVersion: (id: string) => Promise<string>;
};

export async function makeTestApp(files: Record<string, string>, options: TestAppOptions = {}): Promise<TestApp> {
  const root = await makeTempDir();
  await writeFiles(root, files);
  await writeSettings(root, { language: options.language ?? "ru" });

  const listeners = new Set<ChangeListener>();
  const { promise: closed, resolve: markClosed }: PromiseWithResolvers<void> = Promise.withResolvers();
  const changes: ChangeFeed = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    closed,
    close: async () => {
      listeners.clear();
      markClosed();
    },
  };

  const usage = createUsageScanner({ root, claudeProjectsDir: options.transcriptsDir ?? (await makeTempDir()), warn: async () => undefined, now: () => TEST_NOW });
  const memory = createMemorySampler();

  const app = createApp({
    root,
    readLanguage: () => readLanguageOrLocale(root, {}),
    changes,
    allowedHosts: new Set([TEST_HOST]),
    home: root,
    statsServices: { usage, memory, warn: async () => undefined },
    staticDir: options.staticDir,
    now: () => TEST_NOW,
  });

  const taskOnDisk = async (id: string): Promise<Task> => {
    const task = (await loadBacklog(root)).tasks.find((candidate) => candidate.id === id);
    if (!task) throw new Error(`нет задачи ${id}`);
    return task;
  };

  const inFlight = new Set<Promise<Response>>();
  const request = (path: string, init: RequestInit = {}): Promise<Response> => {
    const response = Promise.resolve(app.request(`http://${TEST_HOST}${path}`, { ...init, headers: { host: TEST_HOST, ...init.headers } }));
    const settle = () => void inFlight.delete(response);
    inFlight.add(response);
    response.then(settle, settle);
    return response;
  };

  onTestFinished(async () => {
    await changes.close();
    await Promise.allSettled(inFlight);
    await usage.stop();
    memory.stop();
  });

  return {
    root,
    app,
    usage,
    memory,
    emitChange: async (paths = [root]) => {
      await Promise.all([...listeners].map((listener) => listener(paths)));
    },
    request,
    json: (path, method, body) => request(path, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    taskOnDisk,
    taskVersion: async (id) => (await taskOnDisk(id)).version,
  };
}

export const SAMPLE_FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFile("SPA-1", "priority: high\ntags: [upload]\n"),
  "spa/SPA-2.md": taskFile("SPA-2", "blockedBy: [SPA-1]\n"),
  "spa/SPA-3.md": taskFile("SPA-3", "type: epic\n"),
  "spa/broken.md": "не задача",
  "torg-io/project.md": projectFile("TI"),
  "torg-io/TI-1.md": taskFile("TI-1"),
};
