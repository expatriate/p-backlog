import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { makeTempDir } from "../core/store/testing/temp-dirs";
import { createChangeFeed, createDebouncer, isHiddenPath } from "./change-feed";
import { serverRu } from "./messages.ru";

function watchBacklog(root: string, debounceMs: number) {
  return createChangeFeed({ root, debounceMs, messages: async () => serverRu, warn: () => undefined });
}

function nextChange(feed: ReturnType<typeof watchBacklog>, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("изменение не пришло")), timeoutMs);
    const unsubscribe = feed.subscribe(() => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

describe("createChangeFeed", () => {
  it("сообщает об изменении файла задачи", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    const feed = watchBacklog(root, 20);
    onTestFinished(() => feed.close());
    await new Promise((resolve) => setTimeout(resolve, 300));

    const change = nextChange(feed);
    await writeFile(join(root, "spa/SPA-1.md"), "задача", "utf8");

    await expect(change).resolves.toBeUndefined();
  });

  it("схлопывает пачку файловых изменений в одно событие", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    const feed = watchBacklog(root, 300);
    onTestFinished(() => feed.close());
    await new Promise((resolve) => setTimeout(resolve, 300));

    let calls = 0;
    feed.subscribe(() => {
      calls++;
    });
    await Promise.all(["SPA-1", "SPA-2", "SPA-3"].map((id) => writeFile(join(root, `spa/${id}.md`), id, "utf8")));
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(calls).toBe(1);
  });

  it("после close не зовёт подписчиков", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    const feed = watchBacklog(root, 20);
    await new Promise((resolve) => setTimeout(resolve, 300));

    let calls = 0;
    feed.subscribe(() => {
      calls++;
    });
    await feed.close();
    await writeFile(join(root, "spa/SPA-1.md"), "задача", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 300));

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
