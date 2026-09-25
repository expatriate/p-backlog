import { buildIndex } from "../../core/model/graph";
import { coreMessages } from "../../core/messages";
import { filterTasks, OPEN_STATUSES, sortTasks } from "../../core/model/query";
import { TASK_STATUSES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { describeTask, toJson } from "../describe";
import { formatTaskLine } from "../format";
import type { CliCommand } from "../command";
import { EXIT, parseChoice, parseOptions, splitList, UsageError, type CliIo } from "../io";
import { cliMessages } from "../messages";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";

export const listCommand: CliCommand = {
  name: "list",
  usage: (language) => [cliMessages(language).listUsage()],
  run: runList,
};

async function runList(args: string[], io: CliIo): Promise<number> {
  const cli = cliMessages(io.language);
  const values = parseOptions(io.language, args, {
    query: { type: "string" },
    status: { type: "string" },
    tag: { type: "string" },
    ...SCOPE_OPTIONS,
    json: { type: "boolean", default: false },
  });
  const requestedStatuses = splitList(values.status);
  if (requestedStatuses?.length === 0) throw new UsageError(cli.invalidChoice("--status", TASK_STATUSES, values.status ?? ""));
  const statuses = requestedStatuses?.map((status) => parseChoice(io.language, status, TASK_STATUSES, "--status")) ?? OPEN_STATUSES;

  const loaded = await loadBacklog(io.backlogRoot);
  const scope = resolveScope(loaded, io, values);
  if (scope === null) return EXIT.notFound;
  const projectId = scope.project?.id;
  const messages = coreMessages(io.language);

  for (const error of loaded.errors) {
    if (projectId === undefined || error.projectId === projectId) io.warn(cli.parseErrorLine(error.path, messages.problems(error.problems)));
  }

  const index = buildIndex(loaded.tasks);
  const inScope = new Set(scope.activeIds);
  const filtered = filterTasks(
    loaded.tasks.filter((task) => inScope.has(task.projectId)),
    { projectId, query: values.query, statuses, tags: splitList(values.tag) },
    index,
  );
  const tasks = sortTasks(filtered, { key: "priority", direction: "desc" }, index, io.language);

  if (values.json) io.print(JSON.stringify(tasks.map((task) => toJson(describeTask(task, index))), null, 2));
  else io.print(tasks.length === 0 ? cli.noTasksFound : tasks.map((task) => formatTaskLine(cli, task, index)).join("\n"));
  return EXIT.ok;
}
