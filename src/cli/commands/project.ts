import { parseArgs } from "node:util";
import { buildIndex } from "../../core/model/graph";
import { coreMessages } from "../../core/messages";
import { filterTasks, OPEN_STATUSES } from "../../core/model/query";
import { loadBacklog } from "../../core/store/load";
import { deleteProject, setProjectActive } from "../../core/store/projects";
import { usageError, type CliCommand } from "../command";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { cliMessages, type CliMessages } from "../messages";

export const projectCommand: CliCommand = {
  name: "project",
  usage: (language) => cliMessages(language).projectUsage(),
  run: runProject,
};

async function runProject(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: { confirm: { type: "string" } } }));
  const [action, ...rest] = positionals;
  if (action === "list") return listProjects(io);
  if (action === "status") return changeStatus(rest, io);
  if (action === "delete") return removeProject(rest, values.confirm, io);
  throw usageError(projectCommand, io.language);
}

async function listProjects(io: CliIo): Promise<number> {
  const cli = cliMessages(io.language);
  const loaded = await loadBacklog(io.backlogRoot);
  if (loaded.projects.length === 0) {
    io.print(cli.noProjects);
    return EXIT.ok;
  }
  const index = buildIndex(loaded.tasks);
  for (const project of loaded.projects) {
    const open = filterTasks(loaded.tasks, { projectId: project.id, statuses: OPEN_STATUSES }, index).length;
    io.print(cli.projectListLine({ id: project.id, name: project.name, prefix: project.prefix, statusWord: statusWord(cli, project.active), open }));
  }
  return EXIT.ok;
}

async function changeStatus(positionals: string[], io: CliIo): Promise<number> {
  const cli = cliMessages(io.language);
  const [id, state, ...rest] = positionals;
  if (id === undefined || (state !== "active" && state !== "inactive") || rest.length > 0) throw usageError(projectCommand, io.language);
  const active = state === "active";
  const result = await setProjectActive(io.backlogRoot, id, active);
  if (!result.ok && result.reason === "invalid") {
    io.warn(`${id}: ${coreMessages(io.language).problems(result.problems)}`);
    return EXIT.invalid;
  }
  if (!result.ok) {
    io.warn(cli.projectNotFound(id));
    return EXIT.notFound;
  }
  io.print(`${id}: ${statusWord(cli, !active)} → ${statusWord(cli, active)}`);
  return EXIT.ok;
}

async function removeProject(positionals: string[], confirm: string | undefined, io: CliIo): Promise<number> {
  const cli = cliMessages(io.language);
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0) throw usageError(projectCommand, io.language);
  if (confirm !== id) throw new UsageError(cli.confirmProjectDelete(id));
  const loaded = await loadBacklog(io.backlogRoot);
  const taskCount = loaded.tasks.filter((task) => task.projectId === id).length;
  const result = await deleteProject(io.backlogRoot, id);
  if (!result.ok) {
    io.warn(cli.projectNotFound(id));
    return EXIT.notFound;
  }
  io.print(cli.projectDeleted(id, taskCount));
  return EXIT.ok;
}

function statusWord(cli: CliMessages, active: boolean): string {
  return active ? cli.projectActive : cli.projectInactive;
}
