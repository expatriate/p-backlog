import { runGit, type GitRunner } from "../run";

export function countingGit(): { git: GitRunner; processes: () => number; reset: () => void } {
  let processes = 0;
  return {
    git: (repo, args, input) => {
      processes++;
      return runGit(repo, args, input);
    },
    processes: () => processes,
    reset: () => {
      processes = 0;
    },
  };
}
