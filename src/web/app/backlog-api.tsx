import { createContext, useContext, type ReactNode } from "react";
import { createApiClient, type ApiClient } from "../api/client";
import { openSharedEvents } from "./shared-events";

export type EventStream = { addEventListener: (type: string, listener: () => void) => void; close: () => void };

export type BacklogApi = { client: ApiClient; openEvents: () => EventStream | null };

const BacklogApiContext = createContext<BacklogApi | null>(null);

export const browserApi: BacklogApi = {
  client: createApiClient((path, init) => fetch(path, init)),
  openEvents: () => openSharedEvents("/api/events"),
};

export function BacklogApiProvider({ api, children }: { api: BacklogApi; children: ReactNode }) {
  return <BacklogApiContext.Provider value={api}>{children}</BacklogApiContext.Provider>;
}

export function useBacklogApi(): BacklogApi {
  const api = useContext(BacklogApiContext);
  if (!api) throw new Error("BacklogApiProvider is not mounted");
  return api;
}
