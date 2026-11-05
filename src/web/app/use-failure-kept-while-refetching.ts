import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";

export function useFailureKeptWhileRefetching({ error, data, isFetching }: Pick<UseQueryResult<unknown>, "error" | "data" | "isFetching">): Error | null {
  const [lastFailure, setLastFailure] = useState<Error | null>(null);
  if (error !== null && error !== lastFailure) setLastFailure(error);
  const refetchingWithoutData = data === undefined && isFetching;
  return error ?? (refetchingWithoutData ? lastFailure : null);
}
