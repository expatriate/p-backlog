import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { makeTestApp, type TestApp } from "../../server/testing/test-app";
import { App } from "../app/App";
import { BacklogApiProvider, type BacklogApi } from "../app/backlog-api";
import { createApiClient } from "../api/client";

export type RenderedApp = TestApp & { user: ReturnType<typeof userEvent.setup>; route: () => string };

export async function renderApp(files: Record<string, string>, route = "/"): Promise<RenderedApp> {
  const backlog = await makeTestApp(files);
  const api: BacklogApi = {
    client: createApiClient((path, init) => backlog.request(path, init)),
    openEvents: () => null,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <BacklogApiProvider api={api}>
        <MemoryRouter initialEntries={[route]}>
          <RouteProbe />
          <App />
        </MemoryRouter>
      </BacklogApiProvider>
    </QueryClientProvider>,
  );

  return {
    ...backlog,
    user: userEvent.setup(),
    route: () => screen.getByTestId("route").textContent ?? "",
  };
}

function RouteProbe() {
  const { pathname, search } = useLocation();
  return (
    <span data-testid="route" hidden>
      {pathname}
      {search}
    </span>
  );
}
