import type { PathErrorHandler } from "../../errors";
import { indexOfLoaded, loadBacklog } from "../load";
import { failOnPathError } from "./path-errors";
import { updateTaskInIndex, type UpdateTaskRequest } from "../update";
import type { UpdateTaskResult } from "../write-result";

type TestUpdateRequest = Omit<UpdateTaskRequest, "expectedVersion" | "onError"> & { expectedVersion?: string | undefined; onError?: PathErrorHandler };

export async function updateTask(root: string, request: TestUpdateRequest): Promise<UpdateTaskResult> {
  const index = indexOfLoaded(await loadBacklog(root));
  const expectedVersion = request.expectedVersion ?? index.byId.get(request.id)?.version ?? "";
  return updateTaskInIndex(index, { onError: failOnPathError, ...request, expectedVersion });
}
