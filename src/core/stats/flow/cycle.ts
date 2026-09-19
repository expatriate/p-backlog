import { DAY_MS } from "../../model/lifecycle";
import { isClosing, type TaskHistory, type Transition } from "../history";
import { median, nearestRank, TAIL_FRACTION } from "../numbers";
import type { FlowCycle } from "../types";

type WorkSpan = { closedAt: number; duration: number; blocked: number };

export function flowCycle(histories: readonly TaskHistory[], from: number, to: number): FlowCycle {
  const spans = histories.flatMap(workSpans).filter((span) => span.closedAt >= from && span.closedAt <= to);
  const days = spans.map((span) => span.duration / DAY_MS);
  const total = spans.reduce((sum, span) => sum + span.duration, 0);
  const blocked = spans.reduce((sum, span) => sum + span.blocked, 0);
  return {
    medianDays: median(days),
    p90Days: nearestRank(days, TAIL_FRACTION),
    blockedShare: total === 0 ? null : blocked / total,
    sample: spans.length,
  };
}

function workSpans({ transitions }: TaskHistory): WorkSpan[] {
  const spans: WorkSpan[] = [];
  let segment: Transition[] = [];
  for (const transition of transitions) {
    if (!isClosing(transition)) {
      segment.push(transition);
      continue;
    }
    const span = spanOf(segment, transition);
    if (span !== undefined) spans.push(span);
    segment = [];
  }
  return spans;
}

function spanOf(segment: readonly Transition[], closing: Transition): WorkSpan | undefined {
  const startIndex = segment.findIndex((transition) => transition.to === "in-progress");
  const start = segment[startIndex];
  if (start === undefined) return undefined;
  const steps = segment.slice(startIndex);
  const blocked = steps.reduce((sum, step, index) => (step.to === "blocked" ? sum + (steps[index + 1]?.at ?? closing.at) - step.at : sum), 0);
  return { closedAt: closing.at, duration: closing.at - start.at, blocked };
}
