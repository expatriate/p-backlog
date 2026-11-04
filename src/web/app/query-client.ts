import { QueryClient } from "@tanstack/react-query";
import { apiErrorKind } from "../api/client";

export function createQueryClient({ retries = 1 }: { retries?: number } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { networkMode: "always", retry: (failures, error) => failures < retries && serverMayRecover(error) },
      mutations: { networkMode: "always" },
    },
  });
}

function serverMayRecover(error: unknown): boolean {
  const kind = apiErrorKind(error);
  return kind === "unreachable" || kind === "serverFailure";
}
