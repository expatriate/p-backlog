import { buildIndex } from "../../model/graph";
import { loadBacklog } from "../load";
import { updateTaskInIndex, type UpdateTaskRequest } from "../update";
import type { UpdateTaskResult } from "../write-result";

export async function updateTask(root: string, request: UpdateTaskRequest): Promise<UpdateTaskResult> {
  const { tasks } = await loadBacklog(root);
  return updateTaskInIndex(buildIndex(tasks), request);
}
