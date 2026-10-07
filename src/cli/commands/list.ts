import { buildIndex } from "../../core/model/graph";
import { filterTasks, OPEN_STATUSES, sortTasks } from "../../core/model/query";
import { TASK_STATUSES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { taskJson } from "../describe";
import { formatTaskLine } from "../format";
import type { CliCommand } from "../command";
import { EXIT, parseChoice, parseOptions, splitList, UsageError, type CliIo, type ExitCode } from "../io";
import { cliMessages } from "../messages";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";

export const listCommand: CliCommand = {
  name: "list",
  usage: (language) => [cliMessages(language).listUsage()],
  run: runList,
};

async function runList(args: string[], io: CliIo): Promise<ExitCode> {
  const values = parseOptions(io.language, args, {
    query: { type: "string" },
    status: { type: "string" },
    tag: { type: "string" },
    ...SCOPE_OPTIONS,
    json: { type: "boolean", default: false },
  });
  const requestedStatuses = splitList(values.status);
  if (requestedStatuses?.length === 0) throw new UsageError(io.cli.invalidChoice("--status", TASK_STATUSES, values.status ?? ""));
  const statuses = requestedStatuses?.map((status) => parseChoice(io.language, status, TASK_STATUSES, "--status")) ?? OPEN_STATUSES;

  const loaded = await loadBacklog(io.backlogRoot);
  const scope = resolveScope(loaded, io, values);
  if (scope === null) return EXIT.notFound;
  const projectId = scope.project?.id;

  for (const error of loaded.errors) {
    if (projectId === undefined || error.projectId === projectId) io.warn(io.cli.parseErrorLine(error.path, io.core.problems(error.problems)));
  }

  const index = buildIndex(loaded.tasks);
  const inScope = new Set(scope.activeIds);
  const filtered = filterTasks(
    loaded.tasks.filter((task) => inScope.has(task.projectId)),
    { projectId, query: values.query, statuses, tags: splitList(values.tag) },
    { index, closedInWeb: new Set() },
  );
  const tasks = sortTasks(filtered, { key: "priority", direction: "desc" }, index, io.language);

  if (values.json)
    io.print(
      JSON.stringify(
        tasks.map((task) => taskJson(task, index)),
        null,
        2,
      ),
    );
  else io.print(tasks.length === 0 ? io.cli.noTasksFound : tasks.map((task) => formatTaskLine(io.cli, task, index)).join("\n"));
  return EXIT.ok;
}
