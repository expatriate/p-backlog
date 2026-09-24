import { buildIndex } from "../../model/graph";
import { loadBacklog } from "../load";
import { updateTaskInIndex, type UpdateTaskRequest } from "../update";
import type { UpdateTaskResult } from "../write-result";

type TestUpdateRequest = Omit<UpdateTaskRequest, "expectedVersion"> & { expectedVersion?: string | undefined };

export async function updateTask(root: string, request: TestUpdateRequest): Promise<UpdateTaskResult> {
  const { tasks } = await loadBacklog(root);
  const index = buildIndex(tasks);
  const expectedVersion = request.expectedVersion ?? index.byId.get(request.id)?.version ?? "";
  return updateTaskInIndex(index, { ...request, expectedVersion });
}
