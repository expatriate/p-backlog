import { parseArgs } from "node:util";
import { buildIndex } from "../../core/model/graph";
import { filterTasks, OPEN_STATUSES } from "../../core/model/query";
import { loadBacklog } from "../../core/store/load";
import { deleteProject, setProjectActive } from "../../core/store/projects";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";

const USAGE = "Использование: backlog project list | backlog project status <id> active|inactive | backlog project delete <id> --confirm <id>";

export async function runProject(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: { confirm: { type: "string" } } }));
  const [action, ...rest] = positionals;
  if (action === "list") return listProjects(io);
  if (action === "status") return changeStatus(rest, io);
  if (action === "delete") return removeProject(rest, values.confirm, io);
  throw new UsageError(USAGE);
}

async function listProjects(io: CliIo): Promise<number> {
  const loaded = await loadBacklog(io.backlogRoot);
  if (loaded.projects.length === 0) {
    io.print("Проектов нет");
    return EXIT.ok;
  }
  const index = buildIndex(loaded.tasks);
  for (const project of loaded.projects) {
    const open = filterTasks(loaded.tasks, { projectId: project.id, statuses: OPEN_STATUSES }, index).length;
    io.print(`${project.id} · ${project.name} · ${project.prefix} · ${statusWord(project.active)} · открытых ${open}`);
  }
  return EXIT.ok;
}

async function changeStatus(positionals: string[], io: CliIo): Promise<number> {
  const [id, state, ...rest] = positionals;
  if (id === undefined || (state !== "active" && state !== "inactive") || rest.length > 0) throw new UsageError(USAGE);
  const active = state === "active";
  const result = await setProjectActive(io.backlogRoot, id, active);
  if (!result.ok) {
    io.warn(`Проект ${id} не найден`);
    return EXIT.notFound;
  }
  io.print(`${id}: ${statusWord(!active)} → ${statusWord(active)}`);
  return EXIT.ok;
}

async function removeProject(positionals: string[], confirm: string | undefined, io: CliIo): Promise<number> {
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0) throw new UsageError(USAGE);
  if (confirm !== id) throw new UsageError(`Подтвердите удаление: backlog project delete ${id} --confirm ${id}`);
  const loaded = await loadBacklog(io.backlogRoot);
  const taskCount = loaded.tasks.filter((task) => task.projectId === id).length;
  const result = await deleteProject(io.backlogRoot, id);
  if (!result.ok) {
    io.warn(`Проект ${id} не найден`);
    return EXIT.notFound;
  }
  io.print(`${id} удалён: задач ${taskCount}`);
  return EXIT.ok;
}

function statusWord(active: boolean): string {
  return active ? "активен" : "неактивен";
}
