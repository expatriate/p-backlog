export function listPath(projectId?: string): string {
  return projectId === undefined ? "/" : `/p/${projectId}`;
}

export function taskPath(projectId: string | undefined, taskId: string): string {
  return projectId === undefined ? `/t/${taskId}` : `${listPath(projectId)}/t/${taskId}`;
}

export function statsPath(projectId?: string): string {
  return projectId === undefined ? "/stats" : `/p/${projectId}/stats`;
}
