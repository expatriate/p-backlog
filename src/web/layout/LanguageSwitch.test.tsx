import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectFile } from "../../core/store/testing/temp-dirs";
import { interceptApi, renderApp, serverUnreachable } from "../testing/render-app";

const failLanguagePatch = interceptApi(async (path, init, passOn) => (path === "/api/settings" && init?.method === "PATCH" ? serverUnreachable() : passOn()));

describe("переключатель языка интерфейса", () => {
  it("сбой PATCH /api/settings показывает текст ошибки", async () => {
    const { user } = await renderApp({ "spa/project.md": projectFile("SPA") }, "/", undefined, { beforeRender: failLanguagePatch });

    await user.click(await screen.findByRole("button", { name: "EN" }));

    expect(await screen.findByText(/Не удалось изменить язык/)).toBeDefined();
  });
});
