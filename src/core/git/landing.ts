import { FIELD, outputLines, type GitRunner } from "./run";

export type Landing = { commit: string; firstParent: string; committedAt: string };

export async function firstParentLanding(git: GitRunner, repo: string, commit: string, head: string): Promise<Landing | null> {
  const chain = await firstParentChain(git, repo, commit, head);
  if (chain === null || chain.length === 0) return null;
  const carries = (index: number) => contains(git, repo, chain[index]?.commit ?? "", commit);
  const oldest = chain.length - 1;
  const oldestCarries = await carries(oldest);
  if (oldestCarries === null) return null;
  if (oldestCarries) return chain[oldest] ?? null;
  if ((await carries(0)) !== true) return null;
  let carrying = 0;
  let notCarrying = oldest;
  while (notCarrying - carrying > 1) {
    const middle = Math.floor((carrying + notCarrying) / 2);
    const middleCarries = await carries(middle);
    if (middleCarries === null) return null;
    if (middleCarries) carrying = middle;
    else notCarrying = middle;
  }
  return chain[carrying] ?? null;
}

async function firstParentChain(git: GitRunner, repo: string, commit: string, head: string): Promise<Landing[] | null> {
  const lines = outputLines(await git(repo, ["log", "--first-parent", `--format=tformat:%H${FIELD}%P${FIELD}%cI`, `${commit}..${head}`, "--"]));
  if (lines === null) return null;
  return lines.map((line) => {
    const [sha = "", parents = "", committedAt = ""] = line.split(FIELD);
    return { commit: sha, firstParent: parents.split(" ")[0] ?? "", committedAt };
  });
}

async function contains(git: GitRunner, repo: string, descendant: string, commit: string): Promise<boolean | null> {
  const missing = await git(repo, ["rev-list", "--max-count=1", commit, `^${descendant}`, "--"]);
  return missing === null ? null : missing.trim() === "";
}
