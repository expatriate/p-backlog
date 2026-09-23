import { parseArgs } from "node:util";
import { loadBacklog, type LoadedBacklog } from "../../core/store/load";
import type { Task } from "../../core/model/types";
import { applyAll } from "../apply-all";
import { usageError, type CliCommand } from "../command";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { cliMessages, type CliMessages } from "../messages";
import { taskWriter, type TaskWriter } from "../task-write";

const NO_EPIC = "none";

export const epicCommand: CliCommand = {
  name: "epic",
  usage: (language) => [cliMessages(language).epicUsage(NO_EPIC)],
  run: runEpic,
};

type Move = { loaded: LoadedBacklog; epic: Task | null; write: TaskWriter; io: CliIo };

async function runEpic(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: { to: { type: "string" } } }));
  if (positionals.length === 0 || values.to === undefined) throw usageError(epicCommand, io.language);

  const loaded = await loadBacklog(io.backlogRoot);
  const epic = values.to === NO_EPIC ? null : requireEpic(loaded, io, values.to);
  if (epic === undefined) return EXIT.notFound;

  const move: Move = { loaded, epic, write: taskWriter(io, loaded.tasks), io };
  return applyAll(new Set(positionals), (id) => moveOne(id, move));
}

function requireEpic(loaded: LoadedBacklog, io: CliIo, id: string): Task | undefined {
  const target = requireTask(loaded, io, id);
  if (!target) return undefined;
  if (target.type !== "epic") throw new UsageError(cliMessages(io.language).notAnEpic(target.id));
  return target;
}

async function moveOne(id: string, { loaded, epic, write, io }: Move): Promise<number> {
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  const cli = cliMessages(io.language);
  if (task.type === "epic") {
    io.warn(cli.epicCannotContainEpic(task.id));
    return EXIT.invalid;
  }
  if (epic !== null && epic.id === task.id) {
    io.warn(cli.epicCannotBeSelf(task.id));
    return EXIT.invalid;
  }
  const written = await write(task, { epic: epic === null ? null : epic.id });
  if (!written.ok) return written.exitCode;
  io.print(`${task.id}: ${epicWord(cli, task.epic)} → ${epicWord(cli, written.task.epic)}`);
  return EXIT.ok;
}

function epicWord(cli: CliMessages, epic: string | undefined): string {
  return epic ?? cli.noEpicWord;
}
