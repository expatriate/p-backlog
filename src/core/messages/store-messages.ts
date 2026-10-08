import type { Problem } from "../model/problems";

export type StoreMessages = {
  problem: (problem: Problem) => string;
  epicDoneReason: (ids: readonly string[]) => string;
  runsNotTrimmed: (error: string) => string;
  journalNotCompacted: (dir: string, error: string) => string;
  closedNotSwept: (error: string) => string;
  serviceLogNotTrimmed: (error: string) => string;
};
