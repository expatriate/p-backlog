export type ProjectLabel = (projectId: string, label: string) => string;

export const plainLabel: ProjectLabel = (_projectId, label) => label;

export const labelWithProject: ProjectLabel = (projectId, label) => `${projectId} · ${label}`;

export function scopeLabel(scopeProjectId: string | undefined): ProjectLabel {
  return scopeProjectId === undefined ? labelWithProject : plainLabel;
}

export function formatShare(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)}%`;
}

export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
