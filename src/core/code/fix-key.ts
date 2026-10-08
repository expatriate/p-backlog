declare const fixKeyBrand: unique symbol;

export type ProjectFixKey = string & { readonly [fixKeyBrand]: "project" };

export type RepoFixKey = string & { readonly [fixKeyBrand]: "repo" };

const SEPARATOR = " ";

export function projectFixKey(projectId: string, hash: string): ProjectFixKey {
  return `${projectId}${SEPARATOR}${hash}` as ProjectFixKey;
}

export function repoFixKey(repo: string, hash: string): RepoFixKey {
  return `${repo}${SEPARATOR}${hash}` as RepoFixKey;
}

export function storedRepoFixKey(stored: string): RepoFixKey {
  return stored as RepoFixKey;
}

export function repoOfFixKey(key: RepoFixKey): string {
  return key.slice(0, key.lastIndexOf(SEPARATOR));
}
