import { findSimilarTask } from "../../core/check/candidates";
import { sourceAnchor } from "../../core/check/project-repo";
import { FOUND_HOW } from "../../core/journal/events";
import { coreMessages } from "../../core/messages";
import { PRIORITIES, TASK_CATEGORIES, TASK_TYPES, type Project } from "../../core/model/types";
import { findProjectForDir } from "../../core/store/resolve-project";
import { createTask } from "../../core/store/create";
import { loadBacklog } from "../../core/store/load";
import type { CliCommand } from "../command";
import { EXIT, parseChoice, parseOptions, splitList, UsageError, type CliIo } from "../io";
import { ensureProject } from "../lookups";
import { readOrigin } from "../origin";

export const newCommand: CliCommand = {
  name: "new",
  usage: [
    [
      `--title <заголовок> [--type ${TASK_TYPES.join("|")}] [--priority ${PRIORITIES.join("|")}] [--tags a,b]`,
      `--category <категория> (для задач обязателен) [--found ${FOUND_HOW.join("|")}]`,
      "[--source файл:строка] [--epic ID] [--blocked-by ID,…] [--related ID,…] [--project id] [--json]",
      "[--force — создать, даже если похожая открытая задача уже есть]",
      "(описание задачи читается из stdin)",
    ].join("\n"),
  ],
  run: runNew,
};

async function runNew(args: string[], io: CliIo): Promise<number> {
  const values = parseOptions(args, {
    title: { type: "string" },
    type: { type: "string" },
    priority: { type: "string" },
    tags: { type: "string" },
    category: { type: "string" },
    found: { type: "string" },
    source: { type: "string" },
    epic: { type: "string" },
    "blocked-by": { type: "string" },
    related: { type: "string" },
    project: { type: "string" },
    json: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  });
  if (values.title === undefined) throw new UsageError("--title обязателен");
  const type = values.type === undefined ? undefined : parseChoice(values.type, TASK_TYPES, "--type");
  const priority = values.priority === undefined ? undefined : parseChoice(values.priority, PRIORITIES, "--priority");
  const category = values.category === undefined ? undefined : parseChoice(values.category, TASK_CATEGORIES, "--category");
  if (category === undefined && type !== "epic") throw new UsageError("--category обязателен: bug или категория запаха из каталога code-smells");
  const found = values.found === undefined ? "incidental" : parseChoice(values.found, FOUND_HOW, "--found");
  if (category === "bug" && values.source === undefined) io.warn("У бага нет --source: без файла:строки проверка не увидит, что код задачи изменился");

  const loaded = await loadBacklog(io.backlogRoot);
  const project = await ensureProject(loaded, io, values.project);
  if (!project) return EXIT.notFound;

  const similar = values.force ? null : findSimilarTask({ title: values.title, source: values.source }, loaded.tasks.filter((task) => task.projectId === project.id));
  if (similar !== null) {
    const why = similar.match === "source" ? "тот же source" : "похожий заголовок";
    io.warn(`Похоже на ${similar.task.id} — «${similar.task.title}» (${why}). Если это другая задача — добавьте --force`);
    return EXIT.refused;
  }

  const result = await createTask(io.backlogRoot, {
    project,
    input: {
      title: values.title,
      type,
      priority,
      category,
      tags: splitList(values.tags),
      source: values.source,
      anchor: values.source === undefined ? undefined : await sourceAnchor(project, values.source, io.home),
      epic: values.epic,
      blockedBy: splitList(values["blocked-by"]),
      related: splitList(values.related),
      body: await io.readStdin(),
    },
    existingTasks: loaded.tasks,
    now: io.now(),
    via: "cli",
    provenance: { found, origin: cwdBelongsTo(project, loaded.projects, io) ? await readOrigin(io.cwd) : undefined },
  });
  if (!result.ok) {
    for (const error of result.errors) io.warn(coreMessages(io.language).problem(error));
    return EXIT.invalid;
  }
  io.print(values.json ? JSON.stringify(result.task, null, 2) : `${result.task.id} ${result.task.path}`);
  return EXIT.ok;
}

function cwdBelongsTo(project: Project, knownProjects: readonly Project[], io: CliIo): boolean {
  return findProjectForDir([...knownProjects, project], io.cwd, io.home)?.id === project.id;
}
