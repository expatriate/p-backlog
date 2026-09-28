import { useCallback, useState } from "react";
import type { BatchRequest, BatchResponse } from "../../core/api/contract";
import { PartialBatchError } from "../app/batch-chunks";

export type BatchFailure = { error: Error; rest: BatchRequest };
export type BatchResult = { request: BatchRequest; response: BatchResponse; failure?: BatchFailure };

export function useBatchResult() {
  const [state, setState] = useState<{ result: BatchResult | null; serial: number }>({ result: null, serial: 0 });
  const show = useCallback((result: BatchResult | null) => setState((current) => ({ result, serial: current.serial + 1 })), []);
  return { result: state.result, serial: state.serial, show };
}

export function partialBatchResult(request: BatchRequest, error: Error): BatchResult | null {
  return error instanceof PartialBatchError ? { request, response: error.done, failure: failureOf(error) } : null;
}

export function failureOf(error: PartialBatchError): BatchFailure {
  return { error: error.failure, rest: error.rest };
}

export function isUndoResult(result: BatchResult): boolean {
  return result.request.action.kind === "restore";
}
