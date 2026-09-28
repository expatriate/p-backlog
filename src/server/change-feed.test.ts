import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { writeFileAtomic } from "../core/store/fs-utils";
import { makeTempDir } from "../core/store/testing/temp-dirs";
import { createChangeFeed, createDebouncer, isHiddenPath, type ChangeFeed } from "./change-feed";

const PROBE_FILE = "probe.md";

async function watchedBacklog(root: string, debounceMs: number): Promise<ChangeFeed> {
  const feed = createChangeFeed({ root, debounceMs, warn: async () => undefined });
  onTestFinished(() => feed.close());
  const probe = join(root, PROBE_FILE);
  let writes = 0;
  await vi.waitFor(
    async () => {
      const seen = firstChange(feed, (paths) => paths.includes(probe) || undefined, debounceMs + 200);
      await writeFile(probe, String(++writes), "utf8");
      await seen;
    },
    { timeout: 5_000, interval: 0 },
  );
  return feed;
}

function firstChange<T>(feed: ChangeFeed, pick: (paths: readonly string[]) => T | undefined, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("изменение не пришло"));
    }, timeoutMs);
    const unsubscribe = feed.subscribe((paths) => {
      const picked = pick(paths);
      if (picked === undefined) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(picked);
    });
  });
}

function nextChange(feed: ChangeFeed): Promise<readonly string[]> {
  return firstChange(feed, (paths) => {
    const changed = paths.filter((path) => basename(path) !== PROBE_FILE);
    return changed.length > 0 ? changed : undefined;
  });
}

describe("createChangeFeed", () => {
  it("сообщает, какие файлы изменились; временный файл атомарной записи не виден", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    await writeFile(join(root, "spa/SPA-2.md"), "задача", "utf8");
    const feed = await watchedBacklog(root, 20);

    const created = nextChange(feed);
    await writeFile(join(root, "spa/SPA-1.md"), "задача", "utf8");
    await expect(created).resolves.toEqual([join(root, "spa/SPA-1.md")]);

    const replaced = nextChange(feed);
    await writeFileAtomic(join(root, "spa/SPA-2.md"), "правка");
    await expect(replaced).resolves.toEqual([join(root, "spa/SPA-2.md")]);
  });

  it("схлопывает пачку файловых изменений в одно событие", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    const feed = await watchedBacklog(root, 300);
    const paths = ["SPA-1", "SPA-2", "SPA-3"].map((id) => join(root, `spa/${id}.md`));

    const first = nextChange(feed);
    await Promise.all(paths.map((path) => writeFile(path, path, "utf8")));

    expect([...(await first)].sort()).toEqual(paths);
  });

  it("после close не зовёт подписчиков", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    const witness = await watchedBacklog(root, 300);
    const feed = await watchedBacklog(root, 20);

    let calls = 0;
    feed.subscribe(() => {
      calls++;
    });
    await feed.close();
    const witnessed = firstChange(witness, (paths) => paths.includes(join(root, "spa/SPA-1.md")) || undefined);
    await writeFile(join(root, "spa/SPA-1.md"), "задача", "utf8");
    await witnessed;

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
