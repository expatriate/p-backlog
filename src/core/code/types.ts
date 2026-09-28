export type CommitUnit = { date: string; lines: number };
export type FileLines = { path: string; lines: number };
export type RepoCode = { commits: string[][]; lines: FileLines[]; units: CommitUnit[] };
export type ProjectCode = { projectId: string; name: string; repos: RepoCode[] };
export type FixCommit = { date: string; landedAt?: string | undefined; byAgent: boolean; lines: number; testLines: number };
export type ScannedCode = { projects: ProjectCode[]; unavailableRepos: string[] };
export type CollectedCode = ScannedCode & { fixCommits: ReadonlyMap<string, FixCommit> };
export type FixRequest = { projectId: string; hashes: string[] };
