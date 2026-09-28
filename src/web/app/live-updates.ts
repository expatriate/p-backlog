import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Revision } from "../../core/api/contract";
import { useBacklogApi } from "./backlog-api";
import { invalidateBacklogAndStats, REVISIONED_KEYS, STATS_KEY } from "./query-keys";

export function useLiveUpdates(): void {
  const { openEvents } = useBacklogApi();
  const queryClient = useQueryClient();
  useEffect(() => {
    const stream = openEvents();
    stream.addEventListener("change", (event) => {
      const revision = parseRevision(event.data);
      if (revision === null) {
        void invalidateBacklogAndStats(queryClient);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: STATS_KEY });
      for (const queryKey of REVISIONED_KEYS) void refreshIfBehind(queryClient, queryKey, revision);
    });
    stream.addEventListener("open", () => void invalidateBacklogAndStats(queryClient));
    return () => stream.close();
  }, [openEvents, queryClient]);
}

async function refreshIfBehind(queryClient: QueryClient, queryKey: readonly string[], revision: Revision): Promise<void> {
  await queryClient.getQueryCache().find({ queryKey, exact: true })?.promise?.catch(() => undefined);
  const known = queryClient.getQueryData<{ revision?: Revision }>(queryKey)?.revision;
  if (known === undefined || known.boot !== revision.boot || known.seq < revision.seq) await queryClient.invalidateQueries({ queryKey, exact: true });
}

function parseRevision(data: unknown): Revision | null {
  if (typeof data !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return isRevision(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRevision(value: unknown): value is Revision {
  return typeof value === "object" && value !== null && "boot" in value && typeof value.boot === "string" && "seq" in value && typeof value.seq === "number";
}
