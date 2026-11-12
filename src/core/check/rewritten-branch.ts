import { FIELD, outputLine, outputLines, stdoutOf, type CommitHash, type GitOutcomeRunner } from "../git/run";
import { remembered } from "../remembered";

type BranchMove = { commit: string; parents: readonly string[]; subject: string };

type BranchStep = { from: string; to: BranchMove };

type BranchHistory = { kind: "read"; movesNewestFirst: BranchMove[]; stepsNewestFirst: BranchStep[] } | { kind: "detached" } | { kind: "unreadable" };

type StepLine = "keeps-line" | "leaves-line" | "unknown";

type TipRewrite = "rewritten" | "not-rewritten" | "unknown";

export type RewroteTip = (tip: CommitHash) => Promise<TipRewrite>;

const DETACHED_HEAD_EXIT = 1;
const NOT_AN_ANCESTOR_EXIT = 1;
const REBASE_FINISHED = /^(?:rebase|pull)\b.*(?:\(finish\)|finished): refs\//;
const AMEND = /^commit \(amend\):/;
const REWRITTEN_BY_UPDATE_REFS = /^rewritten during rebase$/;

export function currentBranchRewroteTipOf(repo: string, git: GitOutcomeRunner): RewroteTip {
  let history: Promise<BranchHistory> | undefined;
  const stepLines = new Map<number, Promise<StepLine>>();
  const stepLine = (step: BranchStep, index: number) => remembered(stepLines, index, () => lineOfStep(repo, step, git));
  return async (tip) => {
    const branch = await (history ??= currentBranchHistory(repo, git));
    if (branch.kind === "unreadable") return "unknown";
    if (branch.kind === "detached") return "not-rewritten";
    const tipIndex = branch.movesNewestFirst.findIndex(({ commit }) => commit === tip);
    if (tipIndex <= 0) return "not-rewritten";
    const stepsSinceTip = branch.stepsNewestFirst.slice(0, tipIndex);
    if (!stepsSinceTip.some(({ to }) => isRewrite(to))) return "not-rewritten";
    let rewrite: TipRewrite = "rewritten";
    for (const [index, step] of stepsSinceTip.entries()) {
      const line = await stepLine(step, index);
      if (line === "leaves-line") return "not-rewritten";
      if (line === "unknown") rewrite = "unknown";
    }
    return rewrite;
  };
}

async function currentBranchHistory(repo: string, git: GitOutcomeRunner): Promise<BranchHistory> {
  const symbolicHead = await git(repo, ["symbolic-ref", "-q", "HEAD"]);
  if (symbolicHead.status === "exited" && symbolicHead.exitCode === DETACHED_HEAD_EXIT) return { kind: "detached" };
  const branch = outputLine(stdoutOf(symbolicHead));
  if (branch === null) return { kind: "unreadable" };
  const reflog = outputLines(stdoutOf(await git(repo, ["log", "--walk-reflogs", `--format=%H${FIELD}%P${FIELD}%gs`, branch, "--"])));
  if (reflog === null) return { kind: "unreadable" };
  const movesNewestFirst = reflog.map(branchMove);
  const stepsNewestFirst = movesNewestFirst.flatMap((to, index): BranchStep[] => {
    const from = movesNewestFirst[index + 1];
    return from === undefined ? [] : [{ from: from.commit, to }];
  });
  return { kind: "read", movesNewestFirst, stepsNewestFirst };
}

async function lineOfStep(repo: string, { from, to }: BranchStep, git: GitOutcomeRunner): Promise<StepLine> {
  if (isRewrite(to) || to.parents.includes(from)) return "keeps-line";
  const fromIsAncestor = await git(repo, ["merge-base", "--is-ancestor", from, to.commit]);
  if (fromIsAncestor.status === "ok") return "keeps-line";
  return fromIsAncestor.status === "exited" && fromIsAncestor.exitCode === NOT_AN_ANCESTOR_EXIT ? "leaves-line" : "unknown";
}

function isRewrite({ subject }: BranchMove): boolean {
  return REBASE_FINISHED.test(subject) || AMEND.test(subject) || REWRITTEN_BY_UPDATE_REFS.test(subject);
}

function branchMove(line: string): BranchMove {
  const [commit = "", parents = "", subject = ""] = line.split(FIELD);
  return { commit, parents: parents.split(" ").filter((parent) => parent !== ""), subject };
}
