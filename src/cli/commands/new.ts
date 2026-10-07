import { findSimilarTask } from "../../core/check/duplicates";
import { sourceAnchor } from "../../core/check/project-repo";
import { FOUND_HOW, type FoundHow } from "../../core/journal/events";
import { buildIndex } from "../../core/model/graph";
import { PRIORITIES, TASK_CATEGORIES, TASK_TYPES, type Project } from "../../core/model/types";
import { findProjectForDir } from "../../core/store/resolve-project";
import { createTask } from "../../core/store/create";
import { loadBacklog } from "../../core/store/load";
import type { CliCommand } from "../command";
import { EXIT, parseChoice, parseOptions, splitList, UsageError, type CliIo, type ExitCode } from "../io";
import { ensureProject } from "../lookups";
import { cliMessages } from "../messages";
import { readOrigin } from "../origin";
import { taskJson } from "../describe";

const DEFAULT_FOUND: FoundHow = "manual";

export const newCommand: CliCommand = {
  name: "new",
  usage: (language) => [cliMessages(language).newUsage(TASK_TYPES.join("|"), PRIORITIES.join("|"), FOUND_HOW.join("|"), DEFAULT_FOUND)],
  run: runNew,
};

async function runNew(args: string[], io: CliIo): Promise<ExitCode> {
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
  if (values.title === undefined) throw new UsageError(io.cli.titleRequired);
  const type = values.type === undefined ? undefined : parseChoice(io.language, values.type, TASK_TYPES, "--type");
  const priority = values.priority === undefined ? undefined : parseChoice(io.language, values.priority, PRIORITIES, "--priority");
  const category = values.category === undefined ? undefined : parseChoice(io.language, values.category, TASK_CATEGORIES, "--category");
  if (category === undefined && type !== "epic") throw new UsageError(io.cli.categoryRequired);
  const found = values.found === undefined ? DEFAULT_FOUND : parseChoice(io.language, values.found, FOUND_HOW, "--found");
  if (category === "bug" && values.source === undefined) io.warn(io.cli.bugNeedsSourceWarning);

  const loaded = await loadBacklog(io.backlogRoot);
  const project = await ensureProject(loaded, io, values.project);
  if (!project) return EXIT.notFound;

  const similar = values.force
    ? null
    : findSimilarTask(
        { title: values.title, source: values.source },
        loaded.tasks.filter((task) => task.projectId === project.id),
      );
  if (similar !== null) {
    const why = similar.match === "source" ? io.cli.sameSource : io.cli.similarTitle;
    io.warn(io.cli.similarTaskWarning(similar.task.id, similar.task.title, why));
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
      anchor: values.source === undefined ? undefined : ((await sourceAnchor(project, values.source, io.home, io.cwd)) ?? undefined),
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
    for (const problem of result.problems) io.warn(io.core.problem(problem));
    return EXIT.invalid;
  }
  const { task, reopenedEpic } = result;
  if (reopenedEpic !== undefined) io.warn(io.cli.epicReopened(reopenedEpic.id));
  const tasks = [...loaded.tasks.map((candidate) => (candidate.id === reopenedEpic?.id ? reopenedEpic : candidate)), task];
  io.print(values.json ? JSON.stringify(taskJson(task, buildIndex(tasks)), null, 2) : `${task.id} ${task.path}`);
  return EXIT.ok;
}

function cwdBelongsTo(project: Project, knownProjects: readonly Project[], io: CliIo): boolean {
  return findProjectForDir([...knownProjects, project], io.cwd, io.home)?.id === project.id;
}
