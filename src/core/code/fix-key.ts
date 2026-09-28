export function fixKey(projectId: string, hash: string): string {
  return `${projectId} ${hash}`;
}
