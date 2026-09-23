import type { Candidate } from "../core/check/candidates";
import type { Language } from "../core/i18n/language";
import { cliMessages, type CliMessages } from "./messages";

export function describeCandidate(language: Language, candidate: Candidate): string {
  return `${candidate.task.id} — ${candidate.task.title}: ${evidence(cliMessages(language), candidate)}`;
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
