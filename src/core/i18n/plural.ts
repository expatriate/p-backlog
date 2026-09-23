export function pluralRu(n: number, one: string, few: string, many: string): string {
  if (!Number.isInteger(n)) return few;
  const abs = Math.abs(n);
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = abs % 10;
  if (last === 1) return one;
  return last >= 2 && last <= 4 ? few : many;
}

export function pluralEn(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}

export const NBSP = " ";

export function countRu(n: number, one: string, few: string, many: string): string {
  return `${n.toLocaleString("ru-RU")}${NBSP}${pluralRu(n, one, few, many)}`;
}

export function countEn(n: number, one: string, other: string): string {
  return `${n.toLocaleString("en-US")}${NBSP}${pluralEn(n, one, other)}`;
}
