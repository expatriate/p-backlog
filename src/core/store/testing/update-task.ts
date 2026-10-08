import type { PathErrorHandler } from "../../errors";
import { buildIndex } from "../../model/graph";
import { loadBacklog } from "../load";
import { updateTaskInIndex, type UpdateTaskRequest } from "../update";
import type { UpdateTaskResult } from "../write-result";

export const failOnWriteError: PathErrorHandler = (path, error) => {
  throw new Error(`unexpected write failure at ${path}`, { cause: error });
};

type TestUpdateRequest = Omit<UpdateTaskRequest, "expectedVersion" | "onError"> & { expectedVersion?: string | undefined; onError?: PathErrorHandler };

export async function updateTask(root: string, request: TestUpdateRequest): Promise<UpdateTaskResult> {
  const { tasks } = await loadBacklog(root);
  const index = buildIndex(tasks);
  const expectedVersion = request.expectedVersion ?? index.byId.get(request.id)?.version ?? "";
  return updateTaskInIndex(index, { onError: failOnWriteError, ...request, expectedVersion });
}
