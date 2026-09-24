import { parseArgs } from "node:util";
import { sourceAnchor } from "../../core/check/project-repo";
import { formatLocalIso } from "../../core/model/dates";
import { isClosed } from "../../core/model/graph";
import type { Task } from "../../core/model/types";
import { loadBacklog, type LoadedBacklog } from "../../core/store/load";
import { applyAll } from "../apply-all";
import { usageError, type CliCommand } from "../command";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { projectOf, requireTask } from "../lookups";
import { cliMessages } from "../messages";
import { taskWriter, type TaskWriter } from "../task-write";

export const verifyCommand: CliCommand = {
  name: "verify",
  usage: (language) => [cliMessages(language).verifyUsage()],
  run: runVerify,
};

type Verification = { loaded: LoadedBacklog; source: string | undefined; write: TaskWriter; io: CliIo };

async function runVerify(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({ args, allowPositionals: true, options: { source: { type: "string" } } }),
  );
  if (positionals.length === 0) throw usageError(verifyCommand, io.language);
  const source = values.source?.trim();
  if (source === "") throw new UsageError(cliMessages(io.language).sourceEmpty);
  if (source !== undefined && positionals.length > 1) throw usageError(verifyCommand, io.language);

  const loaded = await loadBacklog(io.backlogRoot);
  const verification: Verification = { loaded, source, write: taskWriter(io, loaded.tasks), io };
  return applyAll(new Set(positionals), (id) => verifyOne(id, verification));
}

async function verifyOne(id: string, { loaded, source, write, io }: Verification): Promise<number> {
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  const cli = cliMessages(io.language);
  if (isClosed(task.status)) {
    io.warn(cli.alreadyInStatusNothingToVerify(id, task.status));
    return EXIT.refused;
  }

  const anchor = await anchorFor(loaded, task, source ?? task.source, io);
  const written = await write(task, { verified: formatLocalIso(io.now()), source, anchor });
  if (!written.ok) return written.exitCode;
  io.print(source === undefined ? cli.verified(id) : cli.verifiedWithSource(id, source));
  return EXIT.ok;
}

async function anchorFor(loaded: LoadedBacklog, task: Task, source: string | undefined, io: CliIo): Promise<string | null | undefined> {
  const project = projectOf(loaded, task);
  return project === undefined || source === undefined ? undefined : sourceAnchor(project, source, io.home);
}
