import type { Candidate } from "../core/check/candidates";

const DUPLICATE_MATCH = { source: "то же место в коде", title: "похожие заголовки" } as const;

export function describeCandidate(candidate: Candidate): string {
  return `${candidate.task.id} — ${candidate.task.title}: ${evidence(candidate)}`;
}

function evidence(candidate: Candidate): string {
  switch (candidate.kind) {
    case "source-changed": {
      const commits = candidate.commits.map((commit) => `${commit.sha} ${commit.subject}`);
      const uncommitted = candidate.uncommitted ? ["есть незакоммиченные правки"] : [];
      return `код менялся (${candidate.path}): ${[...commits, ...uncommitted].join("; ")}`;
    }
    case "source-missing":
      return candidate.renamedTo === undefined
        ? `файла ${candidate.path} нет`
        : `файла ${candidate.path} нет — переименован в ${candidate.renamedTo}`;
    case "duplicate":
      return `похоже на дубль ${candidate.other.id} (${DUPLICATE_MATCH[candidate.match]})`;
    case "no-source":
      return "без source, в репозитории были коммиты после последней проверки";
  }
}
