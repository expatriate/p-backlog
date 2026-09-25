import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { BatchRequest, BatchResponse } from "../../core/api/contract";
import type { ApiClient } from "../api/client";
import { BacklogApiProvider } from "./backlog-api";
import { useBatchTasks, useTasks } from "./queries";

function fakeClient(overrides: Partial<ApiClient>): ApiClient {
  const notImplemented = () => Promise.reject(new Error("not stubbed in this fake"));
  return {
    projects: notImplemented,
    setProjectActive: notImplemented,
    deleteProject: notImplemented,
    tasks: async () => ({ tasks: [], errors: [] }),
    updateTask: notImplemented,
    batchTasks: notImplemented,
    stats: notImplemented,
    codeStats: notImplemented,
    effectStats: notImplemented,
    qualityStats: notImplemented,
    signals: notImplemented,
    costStats: notImplemented,
    memorySamples: notImplemented,
    settings: notImplemented,
    setLanguage: notImplemented,
    ...overrides,
  } as ApiClient;
}

function wrapperFor(client: ApiClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BacklogApiProvider api={{ client, openEvents: () => null }}>{children}</BacklogApiProvider>
    </QueryClientProvider>
  );
  return Wrapper;
}

describe("useBatchTasks", () => {
  it("отправляет тело { tasks, action } и после успеха перезапрашивает список задач один раз", async () => {
    const request: BatchRequest = { tasks: [{ id: "SPA-3", version: "1" }], action: { kind: "close", reason: "неактуально" } };
    const response: BatchResponse = { results: [{ id: "SPA-3", outcome: "done", version: "2", previous: { status: "backlog", priority: "medium", epic: null, resolution: null, reason: null } }] };
    const batchTasks = vi.fn(async () => response);
    const tasksFetch = vi.fn(async () => ({ tasks: [], errors: [] }));
    const client = fakeClient({ batchTasks, tasks: tasksFetch });
    const Wrapper = wrapperFor(client);

    const { result } = renderHook(
      () => ({ batch: useBatchTasks(), tasks: useTasks() }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.tasks.isSuccess).toBe(true));
    expect(tasksFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.batch.mutateAsync(request);
    });

    expect(batchTasks).toHaveBeenCalledTimes(1);
    expect(batchTasks).toHaveBeenCalledWith(request);
    await waitFor(() => expect(tasksFetch).toHaveBeenCalledTimes(2));
  });
});
