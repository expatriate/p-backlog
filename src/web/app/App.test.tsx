import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { projectFile } from "../../core/store/testing/temp-dirs";
import { renderApp } from "../testing/render-app";
import { routes } from "./App";

function Boom(): never {
  throw new Error("сломалось");
}

describe("экран поломки", () => {
  it("ошибка отрисовки показывает экран поломки по-русски", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const [rootRoute] = routes;
    if (!rootRoute) throw new Error("нет корневого маршрута");

    const brokenRoutes = [{ element: rootRoute.element, errorElement: rootRoute.errorElement, children: [{ index: true, element: <Boom /> }] }];

    await renderApp({ "spa/project.md": projectFile("SPA") }, "/", brokenRoutes);

    expect((await screen.findByRole("alert")).textContent).toContain("Интерфейс беклога сломался");
  });
});

describe("неизвестный адрес", () => {
  it.each(["/tasks", "/t", "/stats/unknown"])("%s — «Страница не найдена» рядом с навигацией и ссылка к проектам", async (route) => {
    const app = await renderApp({ "spa/project.md": projectFile("SPA") }, route);

    expect(await screen.findByRole("heading", { level: 1, name: "Страница не найдена" })).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Навигация" })).toBeDefined();
    await app.user.click(screen.getByRole("link", { name: "Вернуться к проектам" }));
    expect(app.route()).toBe("/");
  });
});
