import { sourcePath } from "../check/source-lines";

const REPOSITORY_ROOT = ".";

export function folderOf(source: string): string {
  const path = sourcePath(source);
  const slash = path.lastIndexOf("/");
  return slash === -1 ? REPOSITORY_ROOT : path.slice(0, slash);
}
