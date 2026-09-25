export const SOURCE_LINES = /:(\d+)(?:-(\d+))?$/;

export function lineSuffix(source: string): string {
  return SOURCE_LINES.exec(source)?.[0] ?? "";
}

export function hasLines(source: string): boolean {
  return SOURCE_LINES.test(source);
}

export function sourcePath(source: string): string {
  return source
    .replace(SOURCE_LINES, "")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}
