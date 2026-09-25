import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectFile } from "../core/store/testing/temp-dirs";
import { taskFixture } from "./testing/fixtures";
import type { TestApp } from "../server/testing/test-app";
import { renderApp } from "./testing/render-app";

function failSettingsOnce(app: TestApp): void {
  const request = app.request;
  let failed = false;
  app.request = async (path, init) => {
    if (path === "/api/settings" && !failed) {
      failed = true;
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    return request(path, init);
  };
}

describe("загрузка языка интерфейса", () => {
  it("сбой /api/settings показывает двуязычное сообщение, повтор восстанавливает интерфейс", async () => {
    const { user } = await renderApp({ "spa/project.md": projectFile("SPA") }, "/", undefined, { beforeRender: failSettingsOnce });

    expect(await screen.findByText(/Backlog server is not responding/)).toBeDefined();

    await user.click(screen.getByRole("button", { name: /Retry/ }));

    expect(await screen.findByRole("link", { name: "Задачи" })).toBeDefined();
  });

  it("сбой перезапроса /api/settings после смены языка не стирает открытый черновик описания", async () => {
    let settingsReads = 0;
    const app = await renderApp({ "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFixture("SPA-1", {}, "Описание") }, "/p/spa/t/SPA-1", undefined, {
      beforeRender: (backlog) => {
        const request = backlog.request;
        backlog.request = async (path, init) => {
          if (path !== "/api/settings" || init?.method === "PATCH") return request(path, init);
          settingsReads += 1;
          return settingsReads === 1 ? request(path, init) : Promise.reject(new TypeError("Failed to fetch"));
        };
      },
    });
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });
    await app.user.click(within(panel).getByRole("button", { name: "Редактировать описание" }));
    await app.user.type(within(panel).getByRole("textbox", { name: "Описание задачи" }), " черновик");

    await app.user.click(screen.getByRole("button", { name: "EN" }));

    await waitFor(() => expect(settingsReads).toBe(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "EN" }).getAttribute("aria-pressed")).toBe("true"));
    expect(within(panel).getByRole("textbox", { name: "Task description" })).toHaveProperty("value", expect.stringContaining("черновик"));
    expect(screen.queryByText(/Backlog server is not responding/)).toBeNull();
  });
});
