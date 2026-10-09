import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { writeFileAtomic } from "../core/store/fs-utils";
import { makeTempDir } from "../core/store/testing/temp-dirs";
import { createChangeFeed, createDebouncer, isHiddenPath, type ChangeFeed } from "./change-feed";

const PROBE_PREFIX = "probe-";
let probes = 0;

const isProbe = (path: string): boolean => basename(path).startsWith(PROBE_PREFIX);

async function watchedBacklog(root: string, debounceMs: number): Promise<ChangeFeed> {
  const feed = createChangeFeed({ root, debounceMs, warn: async () => undefined });
  onTestFinished(() => feed.close());
  await vi.waitFor(
    async () => {
      const probeArrived = probeArrivesWithin(feed, debounceMs + 200);
      await writeFile(join(root, "spa", `${PROBE_PREFIX}${++probes}.md`), "", "utf8");
      await probeArrived;
    },
    { timeout: 5_000, interval: 0 },
  );
  return feed;
}

function probeArrivesWithin(feed: ChangeFeed, windowMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("изменение не пришло"));
    }, windowMs);
    const unsubscribe = feed.subscribe((paths) => {
      if (!paths.some(isProbe)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

function recordChanges(feed: ChangeFeed) {
  const events: string[][] = [];
  const seen = new Set<string>();
  let arrival: PromiseWithResolvers<void> = Promise.withResolvers();
  feed.subscribe((paths) => {
    const changed = paths.filter((path) => !isProbe(path));
    if (changed.length === 0) return;
    events.push(changed);
    for (const path of changed) seen.add(path);
    arrival.resolve();
    arrival = Promise.withResolvers();
  });
  return {
    events,
    seen,
    reached: async (...paths: string[]) => {
      while (!paths.every((path) => seen.has(path))) await arrival.promise;
    },
  };
}

describe("createChangeFeed", () => {
  it("сообщает, какие файлы изменились; временный файл атомарной записи не виден", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    await writeFile(join(root, "spa/SPA-2.md"), "задача", "utf8");
    const feed = await watchedBacklog(root, 20);
    const changes = recordChanges(feed);

    await writeFile(join(root, "spa/SPA-1.md"), "задача", "utf8");
    await changes.reached(join(root, "spa/SPA-1.md"));
    await writeFileAtomic(join(root, "spa/SPA-2.md"), "правка");
    await changes.reached(join(root, "spa/SPA-2.md"));

    expect([...changes.seen].sort()).toEqual([join(root, "spa/SPA-1.md"), join(root, "spa/SPA-2.md")]);
  });

  it("схлопывает пачку быстрых файловых изменений: хотя бы одно событие несёт несколько файлов, и все файлы названы", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    const feed = await watchedBacklog(root, 300);
    const changes = recordChanges(feed);
    const paths = ["SPA-1", "SPA-2", "SPA-3"].map((id) => join(root, `spa/${id}.md`));

    await Promise.all(paths.map((path) => writeFile(path, path, "utf8")));
    await changes.reached(...paths);

    expect([...changes.seen].sort()).toEqual(paths);
    expect(changes.events.some((event) => event.length > 1)).toBe(true);
  });

  it("когда наблюдатель готов, подписчики получают изменение корня беклога — файлы, созданные до готовности, перечитываются", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    const feed = createChangeFeed({ root, debounceMs: 20, warn: async () => undefined });
    onTestFinished(() => feed.close());
    const changes = recordChanges(feed);

    await changes.reached(root);
  });

  it("после close не зовёт подписчиков", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    const witness = await watchedBacklog(root, 300);
    const feed = await watchedBacklog(root, 20);
    const witnessed = recordChanges(witness);

    let calls = 0;
    feed.subscribe(() => {
      calls++;
    });
    await feed.close();
    await writeFile(join(root, "spa/SPA-1.md"), "задача", "utf8");
    await witnessed.reached(join(root, "spa/SPA-1.md"));

    expect(calls).toBe(0);
  });
});

describe("createDebouncer", () => {
  it("схлопывает пачку вызовов в один", () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    let calls = 0;
    const debouncer = createDebouncer(100, () => {
      calls++;
    });

    debouncer.schedule();
    vi.advanceTimersByTime(60);
    debouncer.schedule();
    vi.advanceTimersByTime(60);
    debouncer.schedule();
    expect(calls).toBe(0);

    vi.advanceTimersByTime(100);
    expect(calls).toBe(1);
  });

  it("отменённый вызов не срабатывает", () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    let calls = 0;
    const debouncer = createDebouncer(100, () => {
      calls++;
    });

    debouncer.schedule();
    debouncer.cancel();
    vi.advanceTimersByTime(500);

    expect(calls).toBe(0);
  });
});

describe("isHiddenPath", () => {
  it("считает скрытыми пути со скрытым сегментом внутри каталога беклога", () => {
    expect(isHiddenPath("/backlog", "/backlog/spa/.SPA-1.md.tmp")).toBe(true);
    expect(isHiddenPath("/backlog", "/backlog/.git/config")).toBe(true);
    expect(isHiddenPath("/backlog", "/backlog/spa/SPA-1.md")).toBe(false);
  });

  it("не считает скрытым сам каталог беклога, даже если он лежит в скрытой папке", () => {
    expect(isHiddenPath("/home/.local/backlog", "/home/.local/backlog/spa/SPA-1.md")).toBe(false);
  });
});
