import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { projectFile } from "../../core/store/testing/temp-dirs";
import { makeTestApp } from "../../server/testing/test-app";
import { createApiClient } from "../api/client";
import { routes } from "./App";
import { BacklogApiProvider, type BacklogApi } from "./backlog-api";

function Boom(): never {
  throw new Error("сломалось");
}

describe("экран поломки", () => {
  it("ошибка отрисовки показывает экран поломки по-русски", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      consoleError.mockRestore();
      consoleWarn.mockRestore();
    });

    const backlog = await makeTestApp({ "spa/project.md": projectFile("SPA") });
    const api: BacklogApi = {
      client: createApiClient((path, init) => backlog.request(path, init)),
      openEvents: () => null,
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const [rootRoute] = routes;
    if (!rootRoute) throw new Error("нет корневого маршрута");
    const router = createMemoryRouter([
      { element: rootRoute.element, errorElement: rootRoute.errorElement, children: [{ index: true, element: <Boom /> }] },
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <BacklogApiProvider api={api}>
          <RouterProvider router={router} />
        </BacklogApiProvider>
      </QueryClientProvider>,
    );

    expect((await screen.findByRole("alert")).textContent).toContain("Интерфейс беклога сломался");
  });
});
