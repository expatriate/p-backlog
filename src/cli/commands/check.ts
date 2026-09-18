import { parseArgs } from "node:util";
import { checkBacklog, type CheckReport } from "../../core/check/check-backlog";
import { loadBacklog } from "../../core/store/load";
import { describeCandidate } from "../candidate-format";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireProject } from "../lookups";

export async function runCheck(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({
      args,
      allowPositionals: true,
      options: {
        changed: { type: "boolean", default: false },
        project: { type: "string" },
        "all-projects": { type: "boolean", default: false },
        json: { type: "boolean", default: false },
      },
    }),
  );
  if (positionals.length > 0) throw new UsageError(`Лишние аргументы: ${positionals.join(" ")}`);
  if (values.project !== undefined && values["all-projects"]) throw new UsageError("Укажите либо --project, либо --all-projects");

  const loaded = await loadBacklog(io.backlogRoot);
  let projectIds = loaded.projects.map((project) => project.id);
  if (!values["all-projects"]) {
    const project = requireProject(loaded, io, values.project);
    if (!project) return EXIT.notFound;
    projectIds = [project.id];
  }

  const report = await checkBacklog(io.backlogRoot, { projectIds, mode: values.changed ? "changed" : "full", now: io.now(), home: io.home });
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
