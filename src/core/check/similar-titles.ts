import { normalizeText } from "../model/query";

const MIN_WORD_LENGTH = 4;
const STEM_LENGTH = 5;
const MIN_SHARED_STEMS = 2;
const ENOUGH_SHARED_STEMS = 3;
const NEARLY_SAME_SHARE = 0.8;
const DOTTED_NUMBER_OR_WORD = /\d+(?:\.\d+)+|[\p{L}\p{N}]+/gu;
const DIGIT = /\p{N}/u;

export type TitleStems = { longWords: ReadonlySet<string>; allWords: ReadonlySet<string> };

export function titleStems(title: string): TitleStems {
  const words = normalizeText(title).match(DOTTED_NUMBER_OR_WORD) ?? [];
  return { longWords: stemsOf(words.filter(isLongWord)), allWords: stemsOf(words) };
}

export function similarTitles(left: TitleStems, right: TitleStems): boolean {
  const shared = sharedCount(left.longWords, right.longWords);
  return shared >= MIN_SHARED_STEMS && shared >= Math.min(ENOUGH_SHARED_STEMS, left.longWords.size, right.longWords.size);
}

export function nearlySameTitles(left: TitleStems, right: TitleStems): boolean {
  const shared = sharedCount(left.allWords, right.allWords);
  return shared >= MIN_SHARED_STEMS && shared >= NEARLY_SAME_SHARE * (left.allWords.size + right.allWords.size - shared);
}

function isLongWord(word: string): boolean {
  return word.length >= MIN_WORD_LENGTH && !word.includes(".");
}

function stemsOf(words: readonly string[]): Set<string> {
  return new Set(words.map(stemOf));
}

function stemOf(word: string): string {
  return DIGIT.test(word) ? word : word.slice(0, STEM_LENGTH);
}

function sharedCount(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  return [...left].filter((stem) => right.has(stem)).length;
}
