import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { makeTestApp, type TestApp, type TestAppOptions } from "../../server/testing/test-app";
import { routes } from "../app/App";
import { BacklogApiProvider, type BacklogApi, type EventStream } from "../app/backlog-api";
import { createApiClient } from "../api/client";
import { LanguageLoader } from "../app/LanguageLoader";

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
    openEvents: serverEvents((path, init) => backlog.request(path, init)),
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(appRoutes, { initialEntries: [route] });

  render(
    <QueryClientProvider client={queryClient}>
      <BacklogApiProvider api={api}>
        <LanguageLoader>
          <RouterProvider router={router} />
        </LanguageLoader>
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

type Listener = Parameters<EventStream["addEventListener"]>[1];

function serverEvents(request: TestApp["request"]): () => EventStream {
  return () => {
    const listeners = new Map<string, Set<Listener>>();
    const fire = (type: string, data: unknown = "") => listeners.get(type)?.forEach((listener) => listener(new MessageEvent(type, { data })));
    const reading = request("/api/events").then((opened) => opened.body?.pipeThrough(new TextDecoderStream()).getReader());
    void reading.then(async (reader) => {
      if (!reader) return;
      fire("open");
      let buffered = "";
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        buffered += chunk.value;
        const messages = buffered.split("\n\n");
        buffered = messages.pop() ?? "";
        for (const message of messages) fireMessage(message, fire);
      }
    });
    return {
      addEventListener: (type, listener) => listeners.set(type, (listeners.get(type) ?? new Set()).add(listener)),
      close: () => void reading.then((reader) => reader?.cancel()),
    };
  };
}

function fireMessage(message: string, fire: (type: string, data: string) => void): void {
  const field = (name: string) => message.split("\n").find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2);
  const type = field("event");
  if (type !== undefined) fire(type, field("data") ?? "");
}
