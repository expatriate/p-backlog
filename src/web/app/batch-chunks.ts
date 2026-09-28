import type { BatchAction, BatchOutcome, BatchRequest, BatchResponse } from "../../core/api/contract";
import type { ApiClient } from "../api/client";

export class PartialBatchError extends Error {
  constructor(
    readonly done: BatchResponse,
    readonly rest: BatchRequest,
    readonly failure: Error,
  ) {
    super(failure.message);
    this.name = "PartialBatchError";
  }
}

export async function batchInChunks(client: ApiClient, { tasks, action }: BatchRequest, chunkSize: number): Promise<BatchResponse> {
  const results: BatchOutcome[] = [];
  for (let start = 0; start < tasks.length; start += chunkSize) {
    const chunk = tasks.slice(start, start + chunkSize);
    try {
      const response = await client.batchTasks(requestForChunk(action, chunk));
      results.push(...response.results);
    } catch (error) {
      if (start === 0 || !(error instanceof Error)) throw error;
      throw new PartialBatchError({ results }, requestForChunk(action, tasks.slice(start)), error);
    }
  }
  return { results };
}

function requestForChunk(action: BatchAction, chunk: BatchRequest["tasks"]): BatchRequest {
  return { tasks: chunk, action: actionForChunk(action, chunk) };
}

function actionForChunk(action: BatchAction, chunk: BatchRequest["tasks"]): BatchAction {
  if (action.kind !== "restore") return action;
  const ids = new Set(chunk.map(({ id }) => id));
  return { kind: "restore", changes: Object.fromEntries(Object.entries(action.changes).filter(([id]) => ids.has(id))) };
}
