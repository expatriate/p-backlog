import { normalizeText } from "../model/query";

const MIN_WORD_LENGTH = 4;
const STEM_LENGTH = 5;
const MIN_SHARED_STEMS = 2;

export function similarTitles(a: string, b: string): boolean {
  return similarStems(titleStems(a), titleStems(b));
}

export function similarStems(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  const shared = [...left].filter((stem) => right.has(stem)).length;
  return shared >= MIN_SHARED_STEMS && shared * 2 >= Math.min(left.size, right.size);
}

export function titleStems(title: string): Set<string> {
  const words = normalizeText(title).split(/[^\p{L}\p{N}]+/u);
  return new Set(words.filter((word) => word.length >= MIN_WORD_LENGTH).map((word) => word.slice(0, STEM_LENGTH)));
}
