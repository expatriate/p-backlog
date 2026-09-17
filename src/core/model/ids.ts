export const ID_PATTERN = /^[A-Z][A-Z0-9]{0,9}-[1-9]\d*$/;
export const PREFIX_PATTERN = /^[A-Z][A-Z0-9]{0,9}$/;

export type ParsedId = { prefix: string; number: number };

export function parseId(id: string): ParsedId | null {
  if (!ID_PATTERN.test(id)) return null;
  const separator = id.lastIndexOf("-");
  return { prefix: id.slice(0, separator), number: Number(id.slice(separator + 1)) };
}

export function formatId(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

export function compareIds(a: string, b: string): number {
  const left = parseId(a);
  const right = parseId(b);
  if (!left || !right) return a.localeCompare(b);
  return left.prefix === right.prefix ? left.number - right.number : left.prefix.localeCompare(right.prefix);
}

export function derivePrefix(basename: string, taken: ReadonlySet<string>): string {
  const base = prefixBase(basename);
  return firstFree(base, taken, (n) => `${base}${n}`);
}

export function deriveProjectId(basename: string, taken: ReadonlySet<string>): string {
  const slug = basename.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const base = slug === "" ? "project" : slug;
  return firstFree(base, taken, (n) => `${base}-${n}`);
}

const PREFIX_BASE_LENGTH = 4;

function prefixBase(basename: string): string {
  const words = basename.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = words.length > 1 ? words.map((word) => word.charAt(0)).join("") : (words[0] ?? "");
  const prefix = letters.slice(0, PREFIX_BASE_LENGTH).toUpperCase();
  if (prefix === "") return "PROJ";
  if (/^\d/.test(prefix)) return `P${prefix}`;
  return prefix;
}

function firstFree(base: string, taken: ReadonlySet<string>, withNumber: (n: number) => string): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(withNumber(n))) n++;
  return withNumber(n);
}
