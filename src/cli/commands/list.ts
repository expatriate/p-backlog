import { parseArgs } from "node:util";
import { buildIndex } from "../../core/model/graph";
import { filterTasks, OPEN_STATUSES, sortTasks } from "../../core/model/query";
import { TASK_STATUSES } from "../../core/model/types";
import { loadBacklog } from "../../core/store/load";
import { describeTask, toJson } from "../describe";
import { formatTaskLine } from "../format";
import { EXIT, parseChoice, splitList, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireProject } from "../lookups";

export async function runList(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({
      args,
      allowPositionals: true,
      options: {
        query: { type: "string" },
        status: { type: "string" },
        tag: { type: "string" },
        project: { type: "string" },
        "all-projects": { type: "boolean", default: false },
        json: { type: "boolean", default: false },
      },
    }),
  );
  if (positionals.length > 0) throw new UsageError(`Лишние аргументы: ${positionals.join(" ")}`);
  if (values.project !== undefined && values["all-projects"]) throw new UsageError("Укажите либо --project, либо --all-projects");
  const statuses = splitList(values.status)?.map((status) => parseChoice(status, TASK_STATUSES, "--status")) ?? OPEN_STATUSES;

  const loaded = await loadBacklog(io.backlogRoot);
  let projectId: string | undefined;
  if (!values["all-projects"]) {
    const project = requireProject(loaded, io, values.project);
    if (!project) return EXIT.notFound;
    projectId = project.id;
  }

  for (const error of loaded.errors) {
    if (projectId === undefined || error.projectId === projectId) io.warn(`Ошибка разбора ${error.path}: ${error.message}`);
  }

  const index = buildIndex(loaded.tasks);
  const filtered = filterTasks(loaded.tasks, { projectId, query: values.query, statuses, tags: splitList(values.tag) }, index);
  const tasks = sortTasks(filtered, { key: "priority", direction: "desc" }, index);

  if (values.json) io.print(JSON.stringify(tasks.map((task) => toJson(describeTask(task, loaded.tasks, index))), null, 2));
  else io.print(tasks.length === 0 ? "Задач не найдено" : tasks.map((task) => formatTaskLine(task, index)).join("\n"));
  return EXIT.ok;
}
