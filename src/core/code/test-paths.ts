const TEST_DIRECTORIES = new Set(["test", "tests", "__tests__", "e2e", "spec"]);
const TEST_FILE_NAMES = [/\.(test|spec)\.[^.]+$/, /_test\.[^.]+$/, /^test_.+\.py$/];
const RENAMED_SEGMENT = /\{[^}]* => ([^}]*)\}/g;
const RENAMED_WHOLE_PATH = /^.* => /;
const EMPTY_SEGMENT = /\/\//g;

export function isTestPath(numstatPath: string): boolean {
  const segments = currentPath(numstatPath).split("/");
  const fileName = segments.at(-1) ?? "";
  return segments.slice(0, -1).some((segment) => TEST_DIRECTORIES.has(segment)) || TEST_FILE_NAMES.some((pattern) => pattern.test(fileName));
}

function currentPath(numstatPath: string): string {
  return numstatPath.replace(RENAMED_SEGMENT, "$1").replace(RENAMED_WHOLE_PATH, "").replace(EMPTY_SEGMENT, "/");
}
