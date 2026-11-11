import { explicitSourceRepo, relocatedSource, sourceAnchor, taskRepo, type RepoChoice, type SourceAnchor } from "../../core/check/project-repo";
import { creationOrigins } from "../../core/check/project-review";
import { errorText } from "../../core/errors";
import type { TaskOrigin } from "../../core/journal/events";
import { formatLocalIso } from "../../core/model/dates";
import type { Project, Task } from "../../core/model/types";
import { isClosed } from "../../core/model/graph";
import { indexOfLoaded, loadBacklog, type LoadedBacklog } from "../../core/store/load";
import type { TaskChanges } from "../../core/store/update";
import { applyAll } from "../apply-all";
import { usageError, type CliCommand } from "../command";
import { EXIT, UsageError, parseCommandArgs, type CliIo, type ExitCode } from "../io";
import { projectOf, findTaskOrWarn, repoContext, repoLookup, sourcePresenceOrWarn } from "../lookups";
import { cliMessages } from "../messages";
import { taskWriter, type TaskWriter } from "../task-write";

export const verifyCommand: CliCommand = {
  name: "verify",
  usage: (language) => [cliMessages(language).verifyUsage()],
  run: runVerify,
};

type Verification = { loaded: LoadedBacklog; source: string | undefined; write: TaskWriter; io: CliIo };

async function runVerify(args: string[], io: CliIo): Promise<ExitCode> {
  const { values, positionals } = parseCommandArgs(io.language, args, { source: { type: "string" } });
  if (positionals.length === 0) throw usageError(verifyCommand, io.language);
  const source = values.source?.trim();
  if (source === "") throw new UsageError(io.cli.sourceEmpty);
  if (source !== undefined && positionals.length > 1) throw usageError(verifyCommand, io.language);

  const loaded = await loadBacklog(io.backlogRoot);
  const verification: Verification = { loaded, source, write: taskWriter(io, indexOfLoaded(loaded)), io };
  return applyAll(new Set(positionals), (id) => verifyOne(id, verification));
}

async function verifyOne(id: string, { loaded, source, write, io }: Verification): Promise<ExitCode> {
  const task = findTaskOrWarn(loaded, io, id);
  if (!task) return EXIT.notFound;
  if (isClosed(task.status)) {
    io.warn(io.cli.alreadyInStatusNothingToVerify(id, task.status));
    return EXIT.refused;
  }

  const project = projectOf(loaded, task);
  const choice = project === undefined ? undefined : await verifiedRepo(project, task, source, io);
  const repo = choice?.path;
  if (source !== undefined && repo !== undefined && (await sourcePresenceOrWarn(io, repo, source)).kind === "missing") return EXIT.invalid;
  const settled = choice?.settled !== false;
  const target = source ?? (settled ? await relocatedSource(repo, task) : undefined);
  const anchored = target ?? task.source;
  const anchor = anchored === undefined ? undefined : settled ? anchorChange(await sourceAnchor(repo, anchored, repoContext(io).onUnreadable)) : anchorOfUnsettled(task, target);
  const written = await write(task, { verified: formatLocalIso(io.now()), source: target, anchor });
  if (!written.ok) return written.exitCode;
  io.print(target === undefined ? io.cli.verified(id) : io.cli.verifiedWithSource(id, target));
  return EXIT.ok;
}

async function verifiedRepo(project: Project, task: Task, source: string | undefined, io: CliIo): Promise<RepoChoice | undefined> {
  const lookup = repoLookup(io);
  if (source !== undefined) return explicitSourceRepo(project, lookup, source);
  const origins = project.repos.length > 1 ? await creationOrigins(io.backlogRoot, project.id, (error) => io.warn(io.core.branchOriginsReadFailed(project.id, errorText(error)))) : new Map<string, TaskOrigin>();
  return taskRepo(project, lookup, { source: task.source, anchor: task.anchor, origin: origins.get(task.id)?.commit });
}

function anchorOfUnsettled(task: Task, target: string | undefined): TaskChanges["anchor"] {
  return target === undefined || target === task.source ? undefined : null;
}

function anchorChange(found: SourceAnchor): TaskChanges["anchor"] {
  switch (found.kind) {
    case "no-file":
      return undefined;
    case "uncomputable":
      return null;
    case "anchor":
      return found.anchor;
  }
}
