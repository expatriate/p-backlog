import { buildIndex } from "../../core/model/graph";
import { coreMessages } from "../../core/messages";
import { filterTasks, OPEN_STATUSES, sortTasks } from "../../core/model/query";
import { TASK_STATUSES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { describeTask, toJson } from "../describe";
import { formatTaskLine } from "../format";
import type { CliCommand } from "../command";
import { EXIT, parseChoice, parseOptions, splitList, type CliIo } from "../io";
import { resolveScope, SCOPE_OPTIONS } from "../scope-options";

export const listCommand: CliCommand = {
  name: "list",
  usage: ["[--query текст] [--status s,…] [--tag t,…] [--project id | --all-projects] [--json]"],
  run: runList,
};

async function runList(args: string[], io: CliIo): Promise<number> {
  const values = parseOptions(args, {
    query: { type: "string" },
    status: { type: "string" },
    tag: { type: "string" },
    ...SCOPE_OPTIONS,
    json: { type: "boolean", default: false },
  });
  const statuses = splitList(values.status)?.map((status) => parseChoice(status, TASK_STATUSES, "--status")) ?? OPEN_STATUSES;

  const loaded = await loadBacklog(io.backlogRoot);
  const scope = resolveScope(loaded, io, values);
  if (scope === null) return EXIT.notFound;
  const projectId = scope.project?.id;
  const messages = coreMessages(io.language);

  for (const error of loaded.errors) {
    if (projectId === undefined || error.projectId === projectId) io.warn(`Ошибка разбора ${error.path}: ${messages.problems(error.problems)}`);
  }

  const index = buildIndex(loaded.tasks);
  const inScope = new Set(scope.activeIds);
  const filtered = filterTasks(
    loaded.tasks.filter((task) => inScope.has(task.projectId)),
    { projectId, query: values.query, statuses, tags: splitList(values.tag) },
    index,
  );
  const tasks = sortTasks(filtered, { key: "priority", direction: "desc" }, index);

  if (values.json) io.print(JSON.stringify(tasks.map((task) => toJson(describeTask(task, index, messages))), null, 2));
  else io.print(tasks.length === 0 ? "Задач не найдено" : tasks.map((task) => formatTaskLine(task, index)).join("\n"));
  return EXIT.ok;
}
