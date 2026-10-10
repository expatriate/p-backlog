import { findSimilarTask } from "../../core/check/duplicates";
import { warnPathErrors } from "../../core/errors";
import { findRepo, sourceAnchor, type SourceAnchor } from "../../core/check/project-repo";
import { FOUND_HOW, type FoundHow } from "../../core/journal/events";
import { buildIndex } from "../../core/model/graph";
import { PRIORITIES, TASK_CATEGORIES, TASK_TYPES, type Project, type Task } from "../../core/model/types";
import { findProjectForDir } from "../../core/store/resolve-project";
import { createTask } from "../../core/store/create";
import { loadBacklog } from "../../core/store/load";
import type { CliCommand } from "../command";
import { EXIT, parseChoice, parseOptions, splitList, UsageError, type CliIo, type ExitCode } from "../io";
import { ensureProject, repoLookup, repoPlaces } from "../lookups";
import { cliMessages } from "../messages";
import { readOrigin } from "../origin";
import { taskJson } from "../describe";
import { formatJson } from "../format";
import { tasksAfterWrite } from "../task-write";

const DEFAULT_FOUND: FoundHow = "manual";

export const newCommand: CliCommand = {
  name: "new",
  usage: (language) => [cliMessages(language).newUsage(TASK_TYPES.join("|"), PRIORITIES.join("|"), FOUND_HOW.join("|"), DEFAULT_FOUND)],
  run: runNew,
};

const NEW_OPTIONS = {
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
} as const;

async function runNew(args: string[], io: CliIo): Promise<ExitCode> {
  const values = parseOptions(io.language, args, NEW_OPTIONS);
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

  const projectTasks = loaded.tasks.filter((task) => task.projectId === project.id);
  if (!values.force && warnedOfSimilarTask({ title: values.title, source: values.source }, projectTasks, io)) return EXIT.refused;

  const [atSource, body, origin] = await allAfterSettling([
    values.source === undefined ? undefined : anchorOf(project, values.source, io),
    io.readStdin(),
    values.project === undefined || cwdBelongsTo(project, loaded.projects, io) ? readOrigin(io.cwd) : undefined,
  ]);
  const result = await createTask(io.backlogRoot, {
    project,
    input: {
      title: values.title,
      type,
      priority,
      category,
      tags: splitList(values.tags),
      source: values.source,
      anchor: atSource?.kind === "anchor" ? atSource.anchor : undefined,
      epic: values.epic,
      blockedBy: splitList(values["blocked-by"]),
      related: splitList(values.related),
      body,
    },
    existingTasks: loaded.tasks,
    now: io.now(),
    via: "cli",
    onError: warnPathErrors(io.warn),
    provenance: { found, origin },
  });
  if (!result.ok) {
    for (const problem of result.problems) io.warn(io.core.problem(problem));
    return EXIT.invalid;
  }
  const { task, reopenedEpic } = result;
  if (reopenedEpic !== undefined) io.warn(io.cli.epicReopened(reopenedEpic.id));
  io.print(values.json ? formatJson(taskJson(task, buildIndex(tasksAfterWrite(loaded.tasks, result)))) : `${task.id} ${task.path}`);
  return EXIT.ok;
}

function warnedOfSimilarTask(draft: { title: string; source?: string | undefined }, projectTasks: readonly Task[], io: CliIo): boolean {
  const similar = findSimilarTask(draft, projectTasks);
  if (similar === null) return false;
  const why = similar.match === "source" ? io.cli.sameSource : io.cli.similarTitle;
  io.warn(io.cli.similarTaskWarning(similar.task.id, similar.task.title, why));
  return true;
}

async function anchorOf(project: Project, source: string, io: CliIo): Promise<SourceAnchor> {
  const lookup = repoLookup(io);
  return sourceAnchor(await findRepo(project, lookup), source, lookup.onUnreadable);
}

function cwdBelongsTo(project: Project, knownProjects: readonly Project[], io: CliIo): boolean {
  return findProjectForDir([...knownProjects, project], io.cwd, repoPlaces(io))?.id === project.id;
}

async function allAfterSettling<T extends readonly unknown[] | []>(work: T): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }> {
  await Promise.allSettled(work);
  return Promise.all(work);
}
