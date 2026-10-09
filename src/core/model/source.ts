export const SOURCE_LINES = /:(\d+)(?:-(\d+))?$/;

export function lineSuffix(source: string): string {
  return SOURCE_LINES.exec(source)?.[0] ?? "";
}

export function hasLines(source: string): boolean {
  return SOURCE_LINES.test(source);
}

export function sourcePath(source: string): string {
  return collapsedPath(source.replace(SOURCE_LINES, ""));
}

export function namesFolder(source: string): boolean {
  const lastSegment = source.replace(SOURCE_LINES, "").split("/").at(-1);
  return lastSegment === "" || lastSegment === "." || lastSegment === "..";
}

function collapsedPath(path: string): string {
  const absolute = path.startsWith("/");
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    const last = segments.at(-1);
    if (segment !== "..") segments.push(segment);
    else if (last !== undefined && last !== "..") segments.pop();
    else if (!absolute) segments.push(segment);
  }
  return `${absolute ? "/" : ""}${segments.join("/")}`;
}
