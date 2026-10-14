import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectFile } from "../../core/store/testing/temp-dirs";
import { interceptApi, renderApp, serverUnreachable } from "../testing/render-app";

const isLanguagePatch = (path: string, init: RequestInit | undefined) => path === "/api/settings" && init?.method === "PATCH";

const failLanguagePatch = interceptApi(async (path, init, passOn) => (isLanguagePatch(path, init) ? serverUnreachable() : passOn()));

describe("переключатель языка интерфейса", () => {
  it("сбой PATCH /api/settings показывает текст ошибки", async () => {
    const { user } = await renderApp({ "spa/project.md": projectFile("SPA") }, "/", undefined, { beforeRender: failLanguagePatch });

    await user.click(await screen.findByRole("button", { name: "EN" }));

    expect(await screen.findByText(/Не удалось изменить язык/)).toBeDefined();
  });

  it("пока язык меняется, повторное нажатие не шлёт второй запрос", async () => {
    let patches = 0;
    const holdLanguagePatch = interceptApi(async (path, init, passOn) => {
      if (!isLanguagePatch(path, init)) return passOn();
      patches += 1;
      return new Promise<Response>(() => {});
    });
    const { user } = await renderApp({ "spa/project.md": projectFile("SPA") }, "/", undefined, { beforeRender: holdLanguagePatch });
    const english = await screen.findByRole("button", { name: "EN" });

    await user.click(english);
    await waitFor(() => expect(patches).toBe(1));
    await user.click(english);
    await user.click(screen.getByRole("button", { name: "RU" }));

    expect(patches).toBe(1);
  });
});
