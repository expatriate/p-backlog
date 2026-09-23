import { checkBacklog, type CheckReport } from "../../core/check/check-backlog";
import { coreMessages } from "../../core/messages";
import { loadBacklog } from "../../core/store/load";
import { describeCandidate } from "../candidate-format";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, type CliIo } from "../io";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";

export const checkCommand: CliCommand = {
  name: "check",
  usage: ["[--changed] [--project id | --all-projects] [--json]"],
  run: runCheck,
};

async function runCheck(args: string[], io: CliIo): Promise<number> {
  const values = parseOptions(args, {
    changed: { type: "boolean", default: false },
    ...SCOPE_OPTIONS,
    json: { type: "boolean", default: false },
  });

  const loaded = await loadBacklog(io.backlogRoot);
  const scope = resolveScope(loaded, io, values);
  if (scope === null) return EXIT.notFound;
  const { projectIds } = scope;

  const report = await checkBacklog(io.backlogRoot, loaded, { projectIds, mode: values.changed ? "changed" : "full", now: io.now(), home: io.home, messages: coreMessages(io.language) });
  io.print(values.json ? JSON.stringify(report, null, 2) : formatReport(report));
  return report.candidates.length > 0 || report.problems.length > 0 ? EXIT.needsReview : EXIT.ok;
}

function formatReport({ fixed, problems, candidates }: CheckReport): string {
  const sections = [
    section("Исправлено:", fixed),
    section("Проблемы:", problems),
    section("Кандидаты на закрытие:", candidates.map(describeCandidate)),
  ].filter((text) => text !== "");
  return sections.length === 0 ? "Беклог в порядке" : sections.join("\n");
}

function section(title: string, lines: readonly string[]): string {
  return lines.length === 0 ? "" : [title, ...lines.map((line) => `  ${line}`)].join("\n");
}
