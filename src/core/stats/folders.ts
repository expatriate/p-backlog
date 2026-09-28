export function folderOf(source: string): string {
  const path = source.replace(/(:\d+)+$/, "");
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(0, slash);
}
