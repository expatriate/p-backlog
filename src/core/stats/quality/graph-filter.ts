import type { Recorded } from "../../journal/events";
import type { Resolution } from "../../model/types";
import { closingsOf, type TaskHistory } from "../history";
import type { Period } from "../period";
import type { GraphFilterEffect } from "../types";

type FilterOutcome = "caught" | "missed" | "quiet";

const SILENT_CLOSINGS: ReadonlySet<Recorded<Resolution> | undefined> = new Set<Resolution>(["fixed", "obsolete"]);

export function graphFilterEffect(histories: readonly TaskHistory[], period: Period): GraphFilterEffect {
  const outcomes = histories.flatMap((history) =>
    history.filtered.flatMap((at, index) => (period.contains(at) ? [outcomeAfter(history, at, history.filtered[index + 1] ?? Number.POSITIVE_INFINITY)] : [])),
  );
  const count = (outcome: FilterOutcome) => outcomes.filter((candidate) => candidate === outcome).length;
  return { filtered: outcomes.length, caught: count("caught"), missed: count("missed"), quiet: count("quiet") };
}

function outcomeAfter(history: TaskHistory, from: number, until: number): FilterOutcome {
  const within = (at: number) => at > from && at <= until;
  const candidate = history.candidates.find((seen) => seen.evidence === "source-changed" && within(seen.at));
  const closing = closingsOf(history).find((transition) => within(transition.at));
  if (candidate !== undefined && (closing === undefined || candidate.at <= closing.at)) return "caught";
  if (closing === undefined || !SILENT_CLOSINGS.has(closing.resolution)) return "quiet";
  const taken = history.transitions.some((transition) => transition.to === "in-progress" && transition.at > from && transition.at < closing.at);
  return taken ? "quiet" : "missed";
}
