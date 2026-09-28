import { loadBacklog, type LoadedBacklog } from "../../core/store/load";
import type { Task } from "../../core/model/types";
import { applyAll } from "../apply-all";
import { usageError, type CliCommand } from "../command";
import { EXIT, UsageError, parseCommandArgs, type CliIo, type ExitCode } from "../io";
import { findTaskOrWarn } from "../lookups";
import { cliMessages } from "../messages";
import { taskWriter, type TaskWriter } from "../task-write";

const NO_EPIC = "none";

export const epicCommand: CliCommand = {
  name: "epic",
  usage: (language) => [cliMessages(language).epicUsage(NO_EPIC)],
  run: runEpic,
};

type Move = { loaded: LoadedBacklog; epic: Task | null; write: TaskWriter; io: CliIo };

async function runEpic(args: string[], io: CliIo): Promise<ExitCode> {
  const { values, positionals } = parseCommandArgs(io.language, args, { to: { type: "string" } });
  if (positionals.length === 0 || values.to === undefined) throw usageError(epicCommand, io.language);

  const loaded = await loadBacklog(io.backlogRoot);
  const epic = values.to === NO_EPIC ? null : findEpicOrWarn(loaded, io, values.to);
  if (epic === undefined) return EXIT.notFound;

  const move: Move = { loaded, epic, write: taskWriter(io, loaded.tasks), io };
  return applyAll(new Set(positionals), (id) => moveOne(id, move));
}

function findEpicOrWarn(loaded: LoadedBacklog, io: CliIo, id: string): Task | undefined {
  const target = findTaskOrWarn(loaded, io, id);
  if (!target) return undefined;
  if (target.type !== "epic") throw new UsageError(io.cli.notAnEpic(target.id));
  return target;
}

async function moveOne(id: string, { loaded, epic, write, io }: Move): Promise<ExitCode> {
  const task = findTaskOrWarn(loaded, io, id);
  if (!task) return EXIT.notFound;
  if (task.type === "epic") {
    io.warn(io.cli.epicCannotContainEpic(task.id));
    return EXIT.invalid;
  }
  const written = await write(task, { epic: epic === null ? null : epic.id });
  if (!written.ok) return written.exitCode;
  io.print(`${task.id}: ${task.epic ?? io.cli.noEpicWord} → ${written.task.epic ?? io.cli.noEpicWord}`);
  return EXIT.ok;
}
