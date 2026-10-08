import { isClosed } from "../../core/model/graph";
import { deletionDate, normalizeClosingReason, RESOLUTION_STATUS } from "../../core/model/lifecycle";
import type { Task } from "../../core/model/types";
import { formatLocalDay } from "../../core/model/dates";
import { findRepo, hasCommit } from "../../core/check/project-repo";
import { reasonHashes } from "../../core/stats/code/fixes";
import { loadBacklog, type LoadedBacklog } from "../../core/store/load";
import { usageError, type CliCommand } from "../command";
import { EXIT, parseChoice, UsageError, parseCommandArgs, type CliIo, type ExitCode } from "../io";
import { projectOf, findTaskOrWarn, repoLookup } from "../lookups";
import { cliMessages, type CliMessages } from "../messages";
import { taskWriter } from "../task-write";

const CLOSE_RESOLUTIONS = ["fixed", "obsolete", "duplicate"] as const;

export const closeCommand: CliCommand = {
  name: "close",
  usage: (language) => [cliMessages(language).closeUsage(CLOSE_RESOLUTIONS.join("|"))],
  run: runClose,
};

async function runClose(args: string[], io: CliIo): Promise<ExitCode> {
  const { values, positionals } = parseCommandArgs(io.language, args, { as: { type: "string" }, reason: { type: "string" }, "duplicate-of": { type: "string" } });
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0 || values.as === undefined) throw usageError(closeCommand, io.language);
  const resolution = parseChoice(io.language, values.as, CLOSE_RESOLUTIONS, "--as");
  const reason = normalizeClosingReason(values.reason ?? "");
  if (reason === "") throw new UsageError(io.cli.reasonRequired);
  const duplicateOf = values["duplicate-of"];
  const closesAsDuplicate = resolution === "duplicate";
  const namesOriginal = duplicateOf !== undefined;
  if (closesAsDuplicate !== namesOriginal) throw new UsageError(io.cli.duplicateOfRule);

  const loaded = await loadBacklog(io.backlogRoot);
  const task = findTaskOrWarn(loaded, io, id);
  if (!task) return EXIT.notFound;
  if (task.type === "epic") {
    io.warn(io.cli.epicClosesOnItsOwn(id));
    return EXIT.invalid;
  }
  const status = RESOLUTION_STATUS[resolution];
  const attachesFix = resolution === "fixed" && task.status === status && task.resolution === undefined;
  if (isClosed(task.status) && !attachesFix) {
    io.warn(io.cli.alreadyInStatus(id, task.status));
    return EXIT.refused;
  }

  let related = task.related;
  if (duplicateOf !== undefined) {
    const original = findTaskOrWarn(loaded, io, duplicateOf);
    if (!original) return EXIT.notFound;
    const problem = originalProblem(io.cli, task, original);
    if (problem !== null) {
      io.warn(problem);
      return EXIT.invalid;
    }
    related = [...new Set([...task.related, original.id])];
  }

  if (resolution === "fixed" && !(await fixCommitFound(loaded, task, reason, io))) {
    io.warn(io.cli.fixCommitRequired);
    return EXIT.invalid;
  }

  const written = await taskWriter(io, loaded.tasks)(task, { status, related }, { resolution, reason });
  if (!written.ok) return written.exitCode;
  const deletesAt = deletionDate(written.task);
  const change = attachesFix ? status : `${task.status} → ${status}`;
  io.print(`${id}: ${change} (${resolution})${deletesAt === undefined ? "" : io.cli.deletesAtTail(formatLocalDay(deletesAt))}`);
  return EXIT.ok;
}

function originalProblem(cli: CliMessages, task: Task, original: Task): string | null {
  if (original.id === task.id) return cli.cannotDuplicateSelf;
  if (original.projectId !== task.projectId) return cli.fromAnotherProject(original.id);
  if (isClosed(original.status)) return cli.originalAlreadyClosed(original.id, task.id);
  return null;
}

async function fixCommitFound(loaded: LoadedBacklog, task: Task, reason: string, io: CliIo): Promise<boolean> {
  const project = projectOf(loaded, task);
  const repo = project === undefined ? undefined : await findRepo(project, repoLookup(io));
  if (repo === undefined) return true;
  for (const sha of reasonHashes(reason)) if (await hasCommit(repo, sha)) return true;
  return false;
}
