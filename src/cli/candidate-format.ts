import type { Candidate } from "../core/check/candidates";
import type { CliMessages } from "./messages";

export function describeCandidate(cli: CliMessages, candidate: Candidate): string {
  return `${candidate.task.id} — ${candidate.task.title}: ${evidence(cli, candidate)}`;
}

function evidence(cli: CliMessages, candidate: Candidate): string {
  switch (candidate.kind) {
    case "source-changed": {
      const commits = candidate.commits.map((commit) => `${commit.sha} ${commit.subject}`);
      const uncommitted = candidate.uncommitted ? [cli.candidateUncommitted] : [];
      return cli.candidateDescribeChanged(candidate.path, [...commits, ...uncommitted].join("; "));
    }
    case "source-missing":
      return candidate.renamedTo === undefined
        ? cli.candidateDescribeMissing(candidate.path)
        : cli.candidateDescribeRenamed(candidate.path, candidate.renamedTo);
    case "duplicate": {
      const duplicateMatch = { source: cli.candidateEvidenceSameLocation, title: cli.candidateEvidenceSimilarTitles, symbol: cli.candidateEvidenceSameSymbol };
      return cli.candidateDescribeDuplicate(candidate.other.id, duplicateMatch[candidate.match]);
    }
  }
}

export function briefEvidence(cli: CliMessages, candidate: Candidate): string {
  return `${candidate.task.id} (${briefChange(cli, candidate)})`;
}

function briefChange(cli: CliMessages, candidate: Candidate): string {
  switch (candidate.kind) {
    case "source-changed":
      return cli.candidateChanged(candidate.path);
    case "source-missing":
      return candidate.renamedTo === undefined ? cli.candidateMissing(candidate.path) : cli.candidateRenamed(candidate.path, candidate.renamedTo);
    case "duplicate":
      return cli.candidateSimilarTo(candidate.other.id);
  }
}
