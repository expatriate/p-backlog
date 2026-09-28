import { join } from "node:path";
import { errorText } from "../errors";
import { CANDIDATE_EVIDENCE, candidateEvents, candidateGoneEvents, episodeStates, filteredEvents, type CandidateEvidence, type CandidateSighting, type CheckMode, type FilteredSighting } from "../journal/events";
import type { CoreMessages } from "../messages";
import { buildIndex } from "../model/graph";
import type { Task } from "../model/types";
import { appendJournal, readJournal } from "../store/journal";
import { loadBacklog, type LoadedBacklog } from "../store/load";
import { findGitRoots } from "../store/resolve-project";
import { updateTaskInIndex } from "../store/update";
import { isReviewable, type AnchorPlan, type Candidate } from "./candidates";
import { applyFixes, fixFailure, type FixOutcome } from "./check-fixes";
import { findProblems } from "./find-problems";
import type { CheckFix, CheckProblem } from "./findings";
import { projectCheckout } from "./project-repo";
import { creationOrigins, projectReview } from "./project-review";

type CheckTexts = Pick<CoreMessages, "epicDoneReason" | "candidatesRecordFailed" | "branchOriginsReadFailed">;

export type CheckRequest = { projectIds: readonly string[]; mode: CheckMode; now: Date; home: string; messages: CheckTexts; workingDir?: string | undefined };

export type CheckReport = { fixed: CheckFix[]; problems: CheckProblem[]; candidates: Candidate[] };

export async function checkBacklog(root: string, loaded: LoadedBacklog, request: CheckRequest): Promise<CheckReport> {
  const inScope = (projectId: string) => request.projectIds.includes(projectId);
  const full = request.mode === "full";
  const fixes: FixOutcome = full ? await applyFixes(loaded, inScope, request) : { fixed: [], failed: [] };
  const current = fixes.fixed.length > 0 ? await loadBacklog(root) : loaded;

  const projects = current.projects.filter((project) => inScope(project.id));
  const workingRoots = request.workingDir === undefined ? null : findGitRoots(request.workingDir);
  const checkouts = new Map(await Promise.all(projects.map(async (project) => [project.id, await projectCheckout(project, request.home, workingRoots)] as const)));
  const repos = new Map([...checkouts].map(([projectId, checkout]) => [projectId, checkout?.path]));
  const originsOf = (projectId: string) => creationOrigins(root, projectId, (error) => console.error(request.messages.branchOriginsReadFailed(projectId, errorText(error))));
  const reviews = await Promise.all(projects.map(async (project) => projectReview(project, current.tasks, repos.get(project.id), await originsOf(project.id), request.mode)));
  const candidates = reviews.flatMap((review) => review.candidates);
  const anchorPlans = reviews.filter((review) => checkouts.get(review.projectId)?.linkedWorktree !== true).flatMap((review) => review.plans);
  const anchors = await applyAnchorPlans(current.tasks, anchorPlans, request.now);
  const unchecked = new Map(reviews.map((review) => [review.projectId, review.unchecked]));
  const awaiting = new Set(reviews.flatMap((review) => review.awaitingMerge));
  await recordCandidates(root, current.tasks, { candidates, filtered: reviews.flatMap((review) => review.filtered), unchecked, awaiting }, request);
  const reviewProblems = reviews.flatMap((review) => review.problems);
  const problems = full ? [...fixes.failed, ...anchors.failed, ...findProblems(current, projects, repos, inScope), ...reviewProblems] : [];
  return { fixed: [...fixes.fixed, ...anchors.fixed], problems, candidates };
}

type CheckFindings = { candidates: readonly Candidate[]; filtered: readonly FilteredSighting[]; unchecked: ReadonlyMap<string, readonly CandidateEvidence[]>; awaiting: ReadonlySet<string> };

async function recordCandidates(root: string, tasks: readonly Task[], { candidates, filtered, unchecked, awaiting }: CheckFindings, { mode, now, projectIds, messages }: CheckRequest): Promise<void> {
  const projectOf = new Map(tasks.map((task) => [task.id, task.projectId]));
  for (const projectId of projectIds) {
    const dir = join(root, projectId);
    const found = candidates.filter((candidate) => projectOf.get(candidate.task.id) === projectId);
    const filteredHere = filtered.filter((sighting) => projectOf.get(sighting.task) === projectId);
    const reviewed = tasks.filter((task) => task.projectId === projectId && isReviewable(task) && !awaiting.has(task.id)).map((task) => task.id);
    const endsGone = mode === "full";
    if (found.length === 0 && filteredHere.length === 0 && (!endsGone || reviewed.length === 0)) continue;
    const reportFailure = (error: unknown) => console.error(messages.candidatesRecordFailed(projectId, errorText(error)));
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

async function applyAnchorPlans(tasks: readonly Task[], plans: readonly AnchorPlan[], now: Date): Promise<FixOutcome> {
  const index = buildIndex(tasks);
  const fixed: CheckFix[] = [];
  const failed: CheckProblem[] = [];
  for (const plan of plans) {
    const task = index.byId.get(plan.id);
    if (task === undefined) continue;
    const result = await updateTaskInIndex(index, { id: plan.id, changes: plan.changes, expectedVersion: task.version, now, via: "check" });
    if (!result.ok) failed.push(fixFailure(plan.id, result));
    else if (plan.moved !== undefined) fixed.push(plan.moved);
  }
  return { fixed, failed };
}

