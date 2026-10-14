export function fileOf(lines: readonly string[], lineEnd = "\n"): string {
  return `${lines.join(lineEnd)}${lineEnd}`;
}

export function twinBlocks(first: string, second: string, lineEnd = "\n"): string {
  return fileOf([...twinBlock(first), "", "const between = 0;", "", ...twinBlock(second)], lineEnd);
}

function twinBlock(sum: string): string[] {
  return ["function twin() {", "  const a = 1;", "  const b = 2;", `  return ${sum};`, "  const c = 3;", "  const d = 4;", "}"];
}
