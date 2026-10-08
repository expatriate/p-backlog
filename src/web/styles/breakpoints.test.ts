import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTAINER_BREAKPOINTS, VIEWPORT_BREAKPOINTS } from "./breakpoints";

type Rule = "media" | "container";
type Query = { where: string; rule: Rule; widths: number[] | null };

const WEB_DIR = join(import.meta.dirname, "..");
const NAMED: Record<Rule, ReadonlySet<number>> = { media: new Set(Object.values(VIEWPORT_BREAKPOINTS)), container: new Set(Object.values(CONTAINER_BREAKPOINTS)) };
const WIDTH_CONDITIONS = [/^\(\s*(?:min|max)-width\s*:\s*(\d+)px\s*\)$/, /^\(\s*width\s*[<>]=?\s*(\d+)px\s*\)$/, /^\(\s*(\d+)px\s*[<>]=?\s*width\s*\)$/];
const LENGTH = /\d*\.?\d+(?:px|em|rem|ch|vw|vh|vi|cqw|cqi)\b/g;

const queries: Query[] = readdirSync(WEB_DIR, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(".css"))
  .flatMap((path) =>
    [...readFileSync(join(WEB_DIR, path), "utf8").matchAll(/@(media|container)\b([^{]*)\{/g)]
      .filter(([, , prelude = ""]) => /width|inline-size/.test(prelude))
      .map(([, rule, prelude = ""]) => ({ where: `${path}: @${rule}${prelude.trimEnd()}`, rule: rule as Rule, widths: widthsIn(prelude) })),
  );

function widthsIn(prelude: string): number[] | null {
  const conditions = (prelude.match(/\([^()]*\)/g) ?? []).filter((condition) => /width|inline-size/.test(condition));
  const widths = conditions.map((condition) => WIDTH_CONDITIONS.map((pattern) => pattern.exec(condition)?.[1]).find((width) => width !== undefined));
  const parsed = widths.filter((width) => width !== undefined).map(Number);
  return parsed.length === widths.length && parsed.length === (prelude.match(LENGTH) ?? []).length ? parsed : null;
}

const describeQueries = (list: readonly Query[]) => list.map((query) => query.where);

describe("брейкпоинты в CSS", () => {
  it("ширину в каждом @media и @container удаётся прочитать", () => {
    expect(describeQueries(queries.filter((query) => query.widths === null))).toEqual([]);
  });

  it("каждая ширина в запросе — именованный брейкпоинт своего вида: окна для @media, контейнера для @container", () => {
    expect(describeQueries(queries.filter((query) => query.widths?.some((width) => !NAMED[query.rule].has(width))))).toEqual([]);
  });

  it.each(["media", "container"] as const)("каждый именованный брейкпоинт для @%s где-то используется", (rule) => {
    const used = new Set(queries.filter((query) => query.rule === rule).flatMap((query) => query.widths ?? []));
    expect([...NAMED[rule]].filter((width) => !used.has(width))).toEqual([]);
  });
});
