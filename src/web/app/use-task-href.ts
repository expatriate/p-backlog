import { useParams, useSearchParams, type To } from "react-router";
import { taskPath } from "../../core/api/web-paths";

export function useTaskHref(): (taskId: string) => To {
  const { projectId } = useParams();
  const [search] = useSearchParams();
  const searchKey = search.toString();
  return (taskId) => ({ pathname: taskPath(projectId, taskId), search: searchKey });
}
