import { FIELD, outputLine, outputLines, stdoutOf, type CommitHash, type GitOutcomeRunner } from "../git/run";
import { remembered } from "../remembered";

type LineMove = { commit: string; parents: readonly string[]; subject: string };

type LineStep = { from: string; to: LineMove };

type LineHistory = { kind: "read"; stepsNewestFirst: LineStep[] } | { kind: "unreadable" };

type StepLine = "keeps-line" | "leaves-line" | "unknown";

type TipRewrite = "rewritten" | "not-rewritten" | "unknown";

type RewriteOfCommit = { kind: "found"; stepIndex: number } | { kind: "none" } | { kind: "unknown" };

export type RewroteTip = (tip: CommitHash) => Promise<TipRewrite>;

const DETACHED_HEAD_EXIT = 1;
const NOT_AN_ANCESTOR_EXIT = 1;
const REBASE_STEP = /^(?:rebase|pull)\b.*(?:\([a-z-]+\)|finished): /;
const AMEND = /^commit \(amend\):/;
const REWRITTEN_BY_UPDATE_REFS = /^rewritten during rebase$/;

export function currentBranchRewroteTipOf(repo: string, git: GitOutcomeRunner): RewroteTip {
  let history: Promise<LineHistory> | undefined;
  const stepLines = new Map<number, Promise<StepLine>>();
  const stepLine = (step: LineStep, index: number) => remembered(stepLines, index, () => lineOfStep(repo, step, git));
  return async (tip) => {
    const line = await (history ??= currentLineHistory(repo, git));
    if (line.kind === "unreadable") return "unknown";
    const rewrite = await newestRewriteOf(repo, tip, line.stepsNewestFirst, git);
    if (rewrite.kind === "none") return "not-rewritten";
    if (rewrite.kind === "unknown") return "unknown";
    let answer: TipRewrite = "rewritten";
    for (const [index, step] of line.stepsNewestFirst.slice(0, rewrite.stepIndex + 1).entries()) {
      const stepAnswer = await stepLine(step, index);
      if (stepAnswer === "leaves-line") return "not-rewritten";
      if (stepAnswer === "unknown") answer = "unknown";
    }
    return answer;
  };
}

async function currentLineHistory(repo: string, git: GitOutcomeRunner): Promise<LineHistory> {
  const symbolicHead = await git(repo, ["symbolic-ref", "-q", "HEAD"]);
  const detached = symbolicHead.status === "exited" && symbolicHead.exitCode === DETACHED_HEAD_EXIT;
  const ref = detached ? "HEAD" : outputLine(stdoutOf(symbolicHead));
  if (ref === null) return { kind: "unreadable" };
  const reflog = outputLines(stdoutOf(await git(repo, ["log", "--walk-reflogs", `--format=%H${FIELD}%P${FIELD}%gs`, ref, "--"])));
  if (reflog === null) return { kind: "unreadable" };
  const movesNewestFirst = reflog.map(lineMove);
  const stepsNewestFirst = movesNewestFirst.flatMap((to, index): LineStep[] => {
    const from = movesNewestFirst[index + 1];
    return from === undefined ? [] : [{ from: from.commit, to }];
  });
  return { kind: "read", stepsNewestFirst };
}

async function newestRewriteOf(repo: string, commit: CommitHash, stepsNewestFirst: readonly LineStep[], git: GitOutcomeRunner): Promise<RewriteOfCommit> {
  const rewrites = stepsNewestFirst.flatMap(({ from, to }, stepIndex) => (isRewrite(to) ? [{ from, stepIndex }] : []));
  if (rewrites.length === 0) return { kind: "none" };
  const revisions = [commit, "--not", ...rewrites.map(({ from }) => from)];
  const outsideRewrittenLines = outputLines(stdoutOf(await git(repo, ["rev-list", "-n1", "--stdin"], revisions.map((revision) => `${revision}\n`).join(""))));
  if (outsideRewrittenLines === null) return { kind: "unknown" };
  if (outsideRewrittenLines.length > 0) return { kind: "none" };
  for (const { from, stepIndex } of rewrites) {
    if (from === commit) return { kind: "found", stepIndex };
    const isAncestor = await git(repo, ["merge-base", "--is-ancestor", commit, from]);
    if (isAncestor.status === "ok") return { kind: "found", stepIndex };
    if (isAncestor.status !== "exited" || isAncestor.exitCode !== NOT_AN_ANCESTOR_EXIT) return { kind: "unknown" };
  }
  return { kind: "none" };
}

async function lineOfStep(repo: string, { from, to }: LineStep, git: GitOutcomeRunner): Promise<StepLine> {
  if (isRewrite(to) || to.parents.includes(from)) return "keeps-line";
  const fromIsAncestor = await git(repo, ["merge-base", "--is-ancestor", from, to.commit]);
  if (fromIsAncestor.status === "ok") return "keeps-line";
  return fromIsAncestor.status === "exited" && fromIsAncestor.exitCode === NOT_AN_ANCESTOR_EXIT ? "leaves-line" : "unknown";
}

function isRewrite({ subject }: LineMove): boolean {
  return REBASE_STEP.test(subject) || AMEND.test(subject) || REWRITTEN_BY_UPDATE_REFS.test(subject);
}

function lineMove(line: string): LineMove {
  const [commit = "", parents = "", subject = ""] = line.split(FIELD);
  return { commit, parents: parents.split(" ").filter((parent) => parent !== ""), subject };
}
