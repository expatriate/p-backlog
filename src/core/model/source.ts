export const SOURCE_LINES = /:(\d+)(?:-(\d+))?$/;
const PATH_ROOT = /^(?:[A-Za-z]:\/|\/\/(?!\/)|\/)/;

export function lineSuffix(source: string): string {
  return SOURCE_LINES.exec(source)?.[0] ?? "";
}

export function hasLines(source: string): boolean {
  return SOURCE_LINES.test(source);
}

export function sourcePath(source: string): string {
  return collapsedPath(pathPart(source));
}

export function namesFolder(source: string): boolean {
  const lastSegment = pathPart(source).split("/").at(-1);
  return lastSegment === "" || lastSegment === "." || lastSegment === "..";
}

export function isWithin(file: string, folder: string): boolean {
  return file === folder || file.startsWith(folder.endsWith("/") ? folder : `${folder}/`);
}

function pathPart(source: string): string {
  return source.replace(SOURCE_LINES, "").replaceAll("\\", "/");
}

function collapsedPath(path: string): string {
  const root = PATH_ROOT.exec(path)?.[0] ?? "";
  const segments: string[] = [];
  for (const segment of path.slice(root.length).split("/")) {
    if (segment === "" || segment === ".") continue;
    const last = segments.at(-1);
    if (segment !== "..") segments.push(segment);
    else if (last !== undefined && last !== "..") segments.pop();
    else if (root === "") segments.push(segment);
  }
  return `${root}${segments.join("/")}`;
}
