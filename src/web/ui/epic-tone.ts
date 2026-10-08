export const EPIC_TONES = [1, 2, 3, 4, 5] as const;

export type EpicTone = (typeof EPIC_TONES)[number];
