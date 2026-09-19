import type { Hono } from "hono";
import { loadBacklog } from "../../core/store/load";
import { makeTempDir, projectFile, taskFile, writeFiles } from "../../core/store/testing/temp-dirs";
import { createApp } from "../app";
import type { ChangeFeed } from "../change-feed";

export const TEST_HOST = "localhost:4317";
export const TEST_NOW = new Date("2026-09-18T12:00:00Z");

export type TestApp = {
  root: string;
  app: Hono;
  emitChange: () => void;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  json: (path: string, method: "POST" | "PATCH", body: unknown) => Promise<Response>;
  taskVersion: (id: string) => Promise<string>;
};

export async function makeTestApp(files: Record<string, string>, staticDir?: string): Promise<TestApp> {
  const root = await makeTempDir();
  await writeFiles(root, files);

  const listeners = new Set<() => void>();
  const changes: ChangeFeed = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: async () => listeners.clear(),
  };

  const app = createApp({
    root,
    changes,
    allowedHosts: new Set([TEST_HOST]),
    home: root,
    staticDir,
    now: () => TEST_NOW,
  });

  const request = async (path: string, init: RequestInit = {}) =>
    await app.request(`http://${TEST_HOST}${path}`, { ...init, headers: { host: TEST_HOST, ...init.headers } });

  return {
    root,
    app,
    emitChange: () => listeners.forEach((listener) => listener()),
    request,
    json: (path, method, body) =>
      request(path, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    taskVersion: async (id) => {
      const task = (await loadBacklog(root)).tasks.find((candidate) => candidate.id === id);
      if (!task) throw new Error(`нет задачи ${id}`);
      return task.version;
    },
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
