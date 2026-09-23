export function projectLabel(projectId: string, label: string, withProject: boolean): string {
  return withProject ? `${projectId} · ${label}` : label;
}

export function formatShare(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)}%`;
}

export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
