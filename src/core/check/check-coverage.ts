import type { CheckMode } from "../journal/events";

export type CheckCoverage = { repairs: boolean; reportsProblems: boolean; findsDuplicates: boolean; locatesAllSources: boolean; endsGoneEpisodes: boolean };

export const COVERAGE: Record<CheckMode, CheckCoverage> = {
  full: { repairs: true, reportsProblems: true, findsDuplicates: true, locatesAllSources: true, endsGoneEpisodes: true },
  changed: { repairs: false, reportsProblems: false, findsDuplicates: false, locatesAllSources: false, endsGoneEpisodes: false },
};
