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
import { cliMessages } from "../messages";
import { readOrigin } from "../origin";

export const newCommand: CliCommand = {
  name: "new",
  usage: (language) => [cliMessages(language).newUsage(TASK_TYPES.join("|"), PRIORITIES.join("|"), FOUND_HOW.join("|"))],
  run: runNew,
};

async function runNew(args: string[], io: CliIo): Promise<number> {
  const cli = cliMessages(io.language);
  const values = parseOptions(io.language, args, {
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
  if (values.title === undefined) throw new UsageError(cli.titleRequired);
  const type = values.type === undefined ? undefined : parseChoice(io.language, values.type, TASK_TYPES, "--type");
  const priority = values.priority === undefined ? undefined : parseChoice(io.language, values.priority, PRIORITIES, "--priority");
  const category = values.category === undefined ? undefined : parseChoice(io.language, values.category, TASK_CATEGORIES, "--category");
  if (category === undefined && type !== "epic") throw new UsageError(cli.categoryRequired);
  const found = values.found === undefined ? "incidental" : parseChoice(io.language, values.found, FOUND_HOW, "--found");
  if (category === "bug" && values.source === undefined) io.warn(cli.bugNeedsSourceWarning);

  const loaded = await loadBacklog(io.backlogRoot);
  const project = await ensureProject(loaded, io, values.project);
  if (!project) return EXIT.notFound;

  const similar = values.force ? null : findSimilarTask({ title: values.title, source: values.source }, loaded.tasks.filter((task) => task.projectId === project.id));
  if (similar !== null) {
    const why = similar.match === "source" ? cli.sameSource : cli.similarTitle;
    io.warn(cli.similarTaskWarning(similar.task.id, similar.task.title, why));
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
      anchor: values.source === undefined ? undefined : ((await sourceAnchor(project, values.source, io.home)) ?? undefined),
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
