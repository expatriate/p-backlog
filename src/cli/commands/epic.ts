import { parseArgs } from "node:util";
import { loadBacklog, type LoadedBacklog } from "../../core/store/load";
import type { Task } from "../../core/model/types";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { writeTask } from "../task-write";

const NO_EPIC = "none";
const USAGE = `Использование: backlog epic <ID> [<ID> …] --to <ID эпика|${NO_EPIC}>`;

export async function runEpic(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: { to: { type: "string" } } }));
  if (positionals.length === 0 || values.to === undefined) throw new UsageError(USAGE);

  const loaded = await loadBacklog(io.backlogRoot);
  const epic = values.to === NO_EPIC ? null : requireEpic(loaded, io, values.to);
  if (epic === undefined) return EXIT.notFound;

  let exitCode: number = EXIT.ok;
  for (const id of new Set(positionals)) {
    const code = await moveOne(loaded, id, epic, io);
    if (exitCode === EXIT.ok) exitCode = code;
  }
  return exitCode;
}

function requireEpic(loaded: LoadedBacklog, io: CliIo, id: string): Task | undefined {
  const target = requireTask(loaded, io, id);
  if (!target) return undefined;
  if (target.type !== "epic") throw new UsageError(`${target.id} не эпик — перенести задачи можно только в эпик`);
  return target;
}

async function moveOne(loaded: LoadedBacklog, id: string, epic: Task | null, io: CliIo): Promise<number> {
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  if (task.type === "epic") {
    io.warn(`${task.id} — эпик, эпик не может входить в другой эпик`);
    return EXIT.refused;
  }
  if (epic !== null && epic.id === task.id) {
    io.warn(`${task.id} не может быть своим эпиком`);
    return EXIT.refused;
  }
  const written = await writeTask(io, task, { epic: epic === null ? null : epic.id });
  if (!written.ok) return written.exitCode;
  io.print(`${task.id}: ${epicWord(task.epic)} → ${epicWord(written.task.epic)}`);
  return EXIT.ok;
}

function epicWord(epic: string | undefined): string {
  return epic ?? "без эпика";
}
