import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeTempDir } from "../core/store/testing/temp-dirs";
import { createChangeFeed, isHiddenPath } from "./change-feed";

function nextChange(feed: ReturnType<typeof createChangeFeed>, timeoutMs = 2000): Promise<void> {
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
    const feed = createChangeFeed(root, 20);
    onTestFinished(() => feed.close());
    await new Promise((resolve) => setTimeout(resolve, 300));

    const change = nextChange(feed);
    await writeFile(join(root, "spa/SPA-1.md"), "задача", "utf8");

    await expect(change).resolves.toBeUndefined();
  });

  it("объединяет пачку изменений в одно событие", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    const feed = createChangeFeed(root, 50);
    onTestFinished(() => feed.close());
    await new Promise((resolve) => setTimeout(resolve, 300));

    let count = 0;
    feed.subscribe(() => {
      count++;
    });
    for (const id of ["SPA-1", "SPA-2", "SPA-3"]) await writeFile(join(root, `spa/${id}.md`), id, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(count).toBe(1);
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
