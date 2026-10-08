import { join } from "node:path";
import { errorText, warnPathErrors } from "../errors";
import { candidateEvents, candidateGoneEvents, episodeStates, filteredEvents } from "../journal/episodes";
import { CANDIDATE_EVIDENCE, type CandidateEvidence, type CandidateSighting, type CheckMode, type FilteredSighting } from "../journal/events";
import type { CoreMessages } from "../messages";
import type { Project, Task } from "../model/types";
import { appendJournal, readJournal } from "../store/journal";
import { loadBacklog, type LoadedBacklog } from "../store/load";
import { findGitRoots } from "../store/resolve-project";
import { isReviewable, type AnchorPlan, type Candidate, type ReportedCandidate } from "./candidates";
import { applyAnchorPlans, applyFixes, type FixOutcome } from "./check-fixes";
import { findProblems } from "./find-problems";
import type { CheckFix, CheckProblem } from "./findings";
import { projectCheckout, type ProjectCheckout } from "./project-repo";
import { creationOrigins, projectReview, type ProjectReview } from "./project-review";

type CheckTexts = Pick<CoreMessages, "epicDoneReason" | "candidatesRecordFailed" | "branchOriginsReadFailed" | "unreadableSkipped">;

export type CheckRequest = { projectIds: readonly string[]; mode: CheckMode; now: Date; home: string; messages: CheckTexts; warn: (line: string) => void; workingDir?: string | undefined };

export type CheckReport = { fixed: CheckFix[]; problems: CheckProblem[]; candidates: ReportedCandidate[] };

const NO_FIXES: FixOutcome = { fixed: [], failed: [] };

export async function checkBacklog(root: string, loaded: LoadedBacklog, request: CheckRequest): Promise<CheckReport> {
  const inScope = (projectId: string) => request.projectIds.includes(projectId);
  const full = request.mode === "full";
  const writes = { now: request.now, onError: warnPathErrors(request.warn) };
  const fixes = full ? await applyFixes(loaded, inScope, { ...writes, messages: request.messages }) : NO_FIXES;
  const current = fixes.fixed.length > 0 ? await loadBacklog(root) : loaded;
  const projects = current.projects.filter((project) => inScope(project.id));
  const checked = await reviewProjects(root, current.tasks, projects, request);
  const reviews = checked.map(({ review }) => review);
  const anchors = await applyAnchorPlans(current.tasks, checked.flatMap(plansToApply), writes);
  const outcome = candidateOutcome(reviews);
  await recordCandidates(root, current.tasks, outcome, request);
  const repos = new Map(checked.map(({ review, checkout }) => [review.projectId, checkout?.path]));
  const problems = full ? [...fixes.failed, ...anchors.failed, ...findProblems(current, projects, repos, inScope), ...reviews.flatMap((review) => review.problems)] : [];
  return { fixed: [...fixes.fixed, ...anchors.fixed], problems, candidates: outcome.candidates };
}

type CheckedProject = { review: ProjectReview; checkout: ProjectCheckout | undefined };

async function reviewProjects(root: string, tasks: readonly Task[], projects: readonly Project[], request: CheckRequest): Promise<CheckedProject[]> {
  const workingRoots = request.workingDir === undefined ? null : findGitRoots(request.workingDir);
  const originsOf = (projectId: string) => creationOrigins(root, projectId, (error) => request.warn(request.messages.branchOriginsReadFailed(projectId, errorText(error))));
  const onUnreadable = warnPathErrors(request.warn, request.messages.unreadableSkipped);
  return Promise.all(
    projects.map(async (project) => {
      const checkout = await projectCheckout(project, workingRoots, { home: request.home, onUnreadable });
      return { review: await projectReview(project, tasks, { repo: checkout?.path, origins: await originsOf(project.id), mode: request.mode, onUnreadable }), checkout };
    }),
  );
}

function plansToApply({ review, checkout }: CheckedProject): AnchorPlan[] {
  return checkout?.linkedWorktree === true ? [] : review.plans;
}

type CandidateOutcome = { candidates: ReportedCandidate[]; filtered: readonly FilteredSighting[]; unchecked: ReadonlyMap<string, readonly CandidateEvidence[]>; unjudged: ReadonlySet<string> };

function candidateOutcome(reviews: readonly ProjectReview[]): CandidateOutcome {
  return {
    candidates: reviews.flatMap((review) => review.candidates),
    filtered: reviews.flatMap((review) => review.filtered),
    unchecked: new Map(reviews.map((review) => [review.projectId, review.unchecked])),
    unjudged: new Set(reviews.flatMap((review) => [...review.awaitingMerge, ...review.skipped])),
  };
}

async function recordCandidates(root: string, tasks: readonly Task[], { candidates, filtered, unchecked, unjudged }: CandidateOutcome, { mode, now, projectIds, messages, warn }: CheckRequest): Promise<void> {
  const projectOf = new Map(tasks.map((task) => [task.id, task.projectId]));
  for (const projectId of projectIds) {
    const dir = join(root, projectId);
    const found = candidates.filter((candidate) => projectOf.get(candidate.task.id) === projectId);
    const filteredHere = filtered.filter((sighting) => projectOf.get(sighting.task) === projectId);
    const reviewed = tasks.filter((task) => task.projectId === projectId && isReviewable(task) && !unjudged.has(task.id)).map((task) => task.id);
    const endsGone = mode === "full";
    if (found.length === 0 && filteredHere.length === 0 && (!endsGone || reviewed.length === 0)) continue;
    const reportFailure = (error: unknown) => warn(messages.candidatesRecordFailed(projectId, errorText(error)));
    try {
      const journal = await readJournal(dir, projectId);
      const states = episodeStates(journal.events);
      const sightings = found.map(sightingOf);
      const checked = CANDIDATE_EVIDENCE.filter((evidence) => !(unchecked.get(projectId) ?? []).includes(evidence));
      const gone = endsGone ? candidateGoneEvents({ sightings, reviewed, checked }, states, now) : [];
      await appendJournal(dir, [...candidateEvents(sightings, states, now, mode), ...gone, ...filteredEvents(filteredHere, states, now)], (_path, error) => reportFailure(error));
    } catch (error) {
      reportFailure(error);
    }
  }
}

function sightingOf(candidate: Candidate): CandidateSighting {
  const sighting = { task: candidate.task.id, evidence: candidate.kind };
  if (candidate.kind === "source-changed") return { ...sighting, method: candidate.method };
  if (candidate.kind === "duplicate") return { ...sighting, match: candidate.match };
  return sighting;
}
