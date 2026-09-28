import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { projectFile, taskFile } from "../../core/store/testing/temp-dirs";
import { renderApp } from "../testing/render-app";
import { rowTitles } from "../testing/task-list";

describe("шильдик «новая»", () => {
  const SEEN_KEY = "p-backlog.seen";
  const NEW_FILES = {
    "spa/project.md": projectFile("SPA"),
    "spa/SPA-1.md": taskFile("SPA-1", { title: "Старая", created: "2026-09-10T10:00:00+03:00" }),
    "spa/SPA-2.md": taskFile("SPA-2", { title: "Свежая", created: "2026-09-16T10:00:00+03:00" }),
    "spa/SPA-3.md": taskFile("SPA-3", {
      title: "Свежая закрытая",
      created: "2026-09-16T11:00:00+03:00",
      status: "done",
      closed: "2026-09-16T12:00:00+03:00",
    }),
  };

  function rememberFirstVisit(iso: string, seen: string[] = []) {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ since: Date.parse(iso), ids: seen }));
  }

  async function hasBadge(title: string): Promise<boolean> {
    const row = (await screen.findByRole("link", { name: title })).closest("tr");
    if (!row) throw new Error(`нет строки ${title}`);
    return within(row).queryByText("новая") !== null;
  }

  it("при первом запуске существующие задачи не новые", async () => {
    await renderApp(NEW_FILES);

    expect(await hasBadge("Свежая")).toBe(false);
    expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null")).toMatchObject({ ids: [] });
  });

  it("задача, созданная после первого запуска, новая, пока её не открыли; у закрытых шильдика нет", async () => {
    rememberFirstVisit("2026-09-15T00:00:00+03:00");
    const app = await renderApp(NEW_FILES, "/?status=all");

    expect(await hasBadge("Старая")).toBe(false);
    expect(await hasBadge("Свежая")).toBe(true);
    expect(await hasBadge("Свежая закрытая")).toBe(false);

    await app.user.click(screen.getByRole("link", { name: "Свежая" }));
    await screen.findByRole("complementary", { name: "Задача SPA-2" });
    expect(await hasBadge("Свежая")).toBe(false);

    await app.user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-2" })).toBeNull());

    expect(await hasBadge("Свежая")).toBe(false);
    expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null").ids).toEqual(["SPA-2"]);
  });

  it("из памяти просмотренных уходят исчезнувшие с диска задачи, остальные остаются просмотренными", async () => {
    rememberFirstVisit("2026-09-15T00:00:00+03:00", ["SPA-2", "SPA-3", "SPA-99"]);
    await renderApp(NEW_FILES);

    expect(await hasBadge("Свежая")).toBe(false);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null").ids).toEqual(["SPA-2", "SPA-3"]));
  });

  it("задача, открытая в другой вкладке раньше, чем эта о ней узнала, остаётся просмотренной", async () => {
    rememberFirstVisit("2026-09-15T00:00:00+03:00");
    await renderApp(NEW_FILES);
    expect(await hasBadge("Свежая")).toBe(true);

    rememberFirstVisit("2026-09-15T00:00:00+03:00", ["SPA-4"]);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: SEEN_KEY }));
    });

    expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null").ids).toEqual(["SPA-4"]);
  });

  it("просмотр в другой вкладке снимает шильдик", async () => {
    rememberFirstVisit("2026-09-15T00:00:00+03:00");
    await renderApp(NEW_FILES);
    expect(await hasBadge("Свежая")).toBe(true);

    rememberFirstVisit("2026-09-15T00:00:00+03:00", ["SPA-2"]);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: SEEN_KEY }));
    });

    expect(await hasBadge("Свежая")).toBe(false);
  });

  it("без доступа к localStorage шильдиков нет, список работает", async () => {
    const denied = () => {
      throw new Error("доступ запрещён");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(denied);

    await renderApp(NEW_FILES);

    expect(await hasBadge("Свежая")).toBe(false);
    expect(await rowTitles()).toEqual(["Свежая", "Старая"]);
  });
});
