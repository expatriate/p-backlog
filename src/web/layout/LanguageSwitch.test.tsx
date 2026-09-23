import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectFile } from "../../core/store/testing/temp-dirs";
import type { TestApp } from "../../server/testing/test-app";
import { renderApp } from "../testing/render-app";

function failLanguagePatch(app: TestApp): void {
  const request = app.request;
  app.request = async (path, init) => (path === "/api/settings" && init?.method === "PATCH" ? Promise.reject(new TypeError("Failed to fetch")) : request(path, init));
}

describe("переключатель языка интерфейса", () => {
  it("сбой PATCH /api/settings показывает текст ошибки", async () => {
    const { user } = await renderApp({ "spa/project.md": projectFile("SPA") }, "/", undefined, { beforeRender: failLanguagePatch });

    await user.click(await screen.findByRole("button", { name: "English" }));

    expect(await screen.findByText(/Не удалось изменить язык/)).toBeDefined();
  });
});
