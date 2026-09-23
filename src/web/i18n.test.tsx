import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectFile } from "../core/store/testing/temp-dirs";
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
});
