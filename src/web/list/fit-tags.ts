import { sum } from "../../core/stats/numbers";

export type TagFit = { tagWidths: readonly number[]; moreWidth: number; gap: number; available: number };

export function fittingTagCount({ tagWidths, moreWidth, gap, available }: TagFit): number {
  for (let count = tagWidths.length; count > 0; count -= 1) {
    const tagsWidth = sum(tagWidths.slice(0, count)) + gap * (count - 1);
    const needed = count < tagWidths.length ? tagsWidth + gap + moreWidth : tagsWidth;
    if (needed <= available) return count;
  }
  return 0;
}
