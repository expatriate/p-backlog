import { checkBacklog, type CheckReport } from "../../core/check/check-backlog";
import type { CheckProblem } from "../../core/check/findings";
import type { CoreMessages } from "../../core/messages";
import { loadBacklog } from "../../core/store/load";
import { describeCandidate } from "../candidate-format";
import { formatJson } from "../format";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, type CliIo, type ExitCode } from "../io";
import type { CliMessages } from "../messages";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";

export const checkCommand: CliCommand = {
  name: "check",
  usage: () => ["[--changed] [--project id | --all-projects] [--json]"],
  run: runCheck,
};

async function runCheck(args: string[], io: CliIo): Promise<ExitCode> {
  const values = parseOptions(io.language, args, {
    changed: { type: "boolean", default: false },
    ...SCOPE_OPTIONS,
    json: { type: "boolean", default: false },
  });

  const loaded = await loadBacklog(io.backlogRoot);
  const scope = resolveScope(loaded, io, values);
  if (scope === null) return EXIT.notFound;
  const { projectIds } = scope;

  const report = await checkBacklog(io.backlogRoot, loaded, { projectIds, mode: values.changed ? "changed" : "full", now: io.now(), home: io.home, messages: io.core, warn: io.warn, workingDir: io.cwd });
  io.print(values.json ? formatJson(report) : formatReport(io.cli, io.core, report));
  return needsReview(report) ? EXIT.needsReview : EXIT.ok;
}

const PROBLEM_NEEDS_REVIEW: Record<CheckProblem["kind"], boolean> = {
  "task-invalid": true,
  "fix-failed": true,
  "file-not-parsed": true,
  "epics-wait-for-files": false,
  "project-without-repos": false,
  "project-repos-missing": false,
  "project-repo-not-git": false,
  "project-repo-unsafe": false,
  "project-history-unreadable": false,
  "prefix-shared": false,
};

function needsReview({ candidates, problems }: CheckReport): boolean {
  return candidates.length > 0 || problems.some((problem) => PROBLEM_NEEDS_REVIEW[problem.kind]);
}

function formatReport(cli: CliMessages, core: CoreMessages, { fixed, problems, candidates }: CheckReport): string {
  const sections = [
    section(cli.fixedHeader, fixed.map(core.checkFix)),
    section(cli.problemsHeader, problems.map(core.checkProblem)),
    section(
      cli.candidatesHeader,
      candidates.map((candidate) => describeCandidate(cli, candidate)),
    ),
  ].filter((text) => text !== "");
  return sections.length === 0 ? cli.backlogOk : sections.join("\n");
}

function section(title: string, lines: readonly string[]): string {
  return lines.length === 0 ? "" : [title, ...lines.map((line) => `  ${line}`)].join("\n");
}
