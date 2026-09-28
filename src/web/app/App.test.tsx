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
