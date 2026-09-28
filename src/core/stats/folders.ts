import { SOURCE_LINES, sourcePath } from "../check/source-lines";

const REPOSITORY_ROOT = ".";

export function folderOf(source: string): string {
  const path = sourcePath(source);
  if (namesFolder(source)) return path === "" ? REPOSITORY_ROOT : path;
  const slash = path.lastIndexOf("/");
  return slash === -1 ? REPOSITORY_ROOT : path.slice(0, slash);
}

function namesFolder(source: string): boolean {
  return source.replace(SOURCE_LINES, "").endsWith("/");
}
