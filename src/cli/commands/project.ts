import { isClosed } from "../../core/model/graph";
import { loadBacklog } from "../../core/store/load";
import { deleteProject, setProjectActive } from "../../core/store/projects";
import { usageError, type CliCommand } from "../command";
import { EXIT, UsageError, parseCommandArgs, type CliIo, type ExitCode } from "../io";
import { cliMessages, type CliMessages } from "../messages";

const ACTIVE_BY_STATE = { active: true, inactive: false } as const;

type ProjectState = keyof typeof ACTIVE_BY_STATE;

export const projectCommand: CliCommand = {
  name: "project",
  usage: (language) => cliMessages(language).projectUsage(Object.keys(ACTIVE_BY_STATE).join("|")),
  run: runProject,
};

async function runProject(args: string[], io: CliIo): Promise<ExitCode> {
  const { values, positionals } = parseCommandArgs(io.language, args, { confirm: { type: "string" } });
  const [action, ...rest] = positionals;
  if (action === "delete") return removeProject(rest, values.confirm, io);
  if (values.confirm !== undefined) throw usageError(projectCommand, io.language);
  if (action === "list" && rest.length === 0) return listProjects(io);
  if (action === "status") return changeStatus(rest, io);
  throw usageError(projectCommand, io.language);
}

async function listProjects(io: CliIo): Promise<ExitCode> {
  const loaded = await loadBacklog(io.backlogRoot);
  if (loaded.projects.length === 0) {
    io.print(io.cli.noProjects);
    return EXIT.ok;
  }
  for (const project of loaded.projects) {
    const open = loaded.tasks.filter((task) => task.projectId === project.id && !isClosed(task.status)).length;
    io.print(io.cli.projectListLine({ id: project.id, name: project.name, prefix: project.prefix, statusWord: statusWord(io.cli, project.active), open }));
  }
  return EXIT.ok;
}

async function changeStatus(positionals: string[], io: CliIo): Promise<ExitCode> {
  const [id, state, ...rest] = positionals;
  if (id === undefined || !isProjectState(state) || rest.length > 0) throw usageError(projectCommand, io.language);
  const active = ACTIVE_BY_STATE[state];
  const result = await setProjectActive(io.backlogRoot, id, active);
  if (!result.ok && result.reason === "invalid") {
    io.warn(`${id}: ${io.core.problems(result.problems)}`);
    return EXIT.invalid;
  }
  if (!result.ok) {
    io.warn(io.cli.projectNotFound(id));
    return EXIT.notFound;
  }
  io.print(`${id}: ${statusWord(io.cli, !active)} → ${statusWord(io.cli, active)}`);
  return EXIT.ok;
}

async function removeProject(positionals: string[], confirm: string | undefined, io: CliIo): Promise<ExitCode> {
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0) throw usageError(projectCommand, io.language);
  if (confirm !== id) throw new UsageError(io.cli.confirmProjectDelete(id));
  const loaded = await loadBacklog(io.backlogRoot);
  const taskCount = loaded.tasks.filter((task) => task.projectId === id).length;
  const result = await deleteProject(io.backlogRoot, id);
  if (!result.ok) {
    io.warn(io.cli.projectNotFound(id));
    return EXIT.notFound;
  }
  io.print(io.cli.projectDeleted(id, taskCount));
  return EXIT.ok;
}

function isProjectState(value: string | undefined): value is ProjectState {
  return value !== undefined && Object.hasOwn(ACTIVE_BY_STATE, value);
}

function statusWord(cli: CliMessages, active: boolean): string {
  return active ? cli.projectActive : cli.projectInactive;
}
