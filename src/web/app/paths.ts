export function listPath(projectId?: string): string {
  return projectId === undefined ? "/" : `/p/${projectId}`;
}

export function statsPath(projectId?: string): string {
  return projectId === undefined ? "/stats" : `/p/${projectId}/stats`;
}
