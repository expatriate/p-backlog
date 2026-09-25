import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { makeTestApp, type TestApp, type TestAppOptions } from "../../server/testing/test-app";
import { routes } from "../app/App";
import { BacklogApiProvider, type BacklogApi, type EventStream } from "../app/backlog-api";
import { createApiClient } from "../api/client";
import { MessagesProvider } from "../i18n";

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
  const events = fakeEventSource();
  const api: BacklogApi = {
    client: createApiClient((path, init) => backlog.request(path, init)),
    openEvents: events.open,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(appRoutes, { initialEntries: [route] });

  render(
    <QueryClientProvider client={queryClient}>
      <BacklogApiProvider api={api}>
        <MessagesProvider>
          <RouterProvider router={router} />
        </MessagesProvider>
      </BacklogApiProvider>
    </QueryClientProvider>,
  );

  return {
    ...backlog,
    emitChange: () => {
      backlog.emitChange();
      events.emitChange();
    },
    user: userEvent.setup(),
    router,
    route: () => `${router.state.location.pathname}${router.state.location.search}`,
  };
}

type StreamListeners = Map<string, Set<() => void>>;

function fakeEventSource() {
  const streams = new Set<StreamListeners>();
  const fire = (listeners: StreamListeners, type: string) => listeners.get(type)?.forEach((listener) => listener());
  const open = (): EventStream => {
    const listeners: StreamListeners = new Map();
    streams.add(listeners);
    setTimeout(() => {
      if (streams.has(listeners)) fire(listeners, "open");
    });
    return {
      addEventListener: (type, listener) => listeners.set(type, (listeners.get(type) ?? new Set()).add(listener)),
      close: () => streams.delete(listeners),
    };
  };
  return { open, emitChange: () => streams.forEach((listeners) => fire(listeners, "change")) };
}
