import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { makeTestApp, type TestApp, type TestAppOptions } from "../../server/testing/test-app";
import { routes } from "../app/App";
import { BacklogApiProvider, type BacklogApi } from "../app/backlog-api";
import { createApiClient } from "../api/client";

export type RenderedApp = TestApp & {
  user: ReturnType<typeof userEvent.setup>;
  router: ReturnType<typeof createMemoryRouter>;
  route: () => string;
};

export type RenderAppOptions = TestAppOptions & { beforeRender?: (app: TestApp) => void | Promise<void> };

export async function renderApp(files: Record<string, string>, route = "/", appRoutes: RouteObject[] = routes, options: RenderAppOptions = {}): Promise<RenderedApp> {
  const { beforeRender, ...testAppOptions } = options;
  const backlog = await makeTestApp(files, testAppOptions);
  if (testAppOptions.transcriptsDir !== undefined) {
    await backlog.usage.scanOnce();
  }
  await beforeRender?.(backlog);
  const api: BacklogApi = {
    client: createApiClient((path, init) => backlog.request(path, init)),
    openEvents: () => null,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(appRoutes, { initialEntries: [route] });

  render(
    <QueryClientProvider client={queryClient}>
      <BacklogApiProvider api={api}>
        <RouterProvider router={router} />
      </BacklogApiProvider>
    </QueryClientProvider>,
  );

  return {
    ...backlog,
    user: userEvent.setup(),
    router,
    route: () => `${router.state.location.pathname}${router.state.location.search}`,
  };
}
