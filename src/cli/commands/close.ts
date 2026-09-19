import { parseArgs } from "node:util";
import { isClosed } from "../../core/model/graph";
import { deletionDate, RESOLUTION_STATUS } from "../../core/model/lifecycle";
import type { Task } from "../../core/model/types";
import { findRepo, hasCommit } from "../../core/check/project-repo";
import { reasonHashes } from "../../core/stats/code/fixes";
import { loadBacklog, type LoadedBacklog } from "../../core/store/load";
import { updateTask } from "../../core/store/update";
import { formatDay } from "../format";
import { EXIT, parseChoice, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { reportUpdateFailure } from "../update-failure";

const CLOSE_RESOLUTIONS = ["fixed", "obsolete", "duplicate"] as const;
const USAGE = "Использование: backlog close <ID> --as fixed|obsolete|duplicate --reason <улика> [--duplicate-of <ID>]";

export async function runClose(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({
      args,
      allowPositionals: true,
      options: { as: { type: "string" }, reason: { type: "string" }, "duplicate-of": { type: "string" } },
    }),
  );
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0 || values.as === undefined) throw new UsageError(USAGE);
  const resolution = parseChoice(values.as, CLOSE_RESOLUTIONS, "--as");
  const reason = (values.reason ?? "").replace(/\s*\n\s*/g, " ").trim();
  if (reason === "") throw new UsageError("--reason обязателен: коммит, строка или факт, по которому задача закрыта");
  const duplicateOf = values["duplicate-of"];
  if ((resolution === "duplicate") !== (duplicateOf !== undefined)) {
    throw new UsageError("--duplicate-of задаётся вместе с --as duplicate и только с ним");
  }

  const loaded = await loadBacklog(io.backlogRoot);
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  if (task.type === "epic") {
    io.warn(`${id} — эпик: он закроется сам, когда закроются все его задачи (backlog check)`);
    return EXIT.invalid;
  }
  if (isClosed(task.status)) {
    io.warn(`${id} уже в статусе ${task.status}`);
    return EXIT.refused;
  }

  let related = task.related;
  if (duplicateOf !== undefined) {
    const original = requireTask(loaded, io, duplicateOf);
    if (!original) return EXIT.notFound;
    const problem = originalProblem(task, original);
    if (problem !== null) {
      io.warn(problem);
      return EXIT.invalid;
    }
    related = [...new Set([...task.related, original.id])];
  }

  if (resolution === "fixed" && !(await fixCommitFound(loaded, task, reason, io))) {
    io.warn('Укажите коммит исправления: --reason "Исправлено в <sha>: …" (коммит должен быть в репозитории проекта)');
    return EXIT.invalid;
  }

  const status = RESOLUTION_STATUS[resolution];
  const result = await updateTask(io.backlogRoot, {
    id,
    changes: { status, related },
    expectedVersion: task.version,
    now: io.now(),
    via: "cli",
    closure: { resolution, reason },
  });
  if (!result.ok) return reportUpdateFailure(io, id, result);
  const deletesAt = deletionDate(result.task);
  io.print(`${id}: ${task.status} → ${status} (${resolution})${deletesAt === undefined ? "" : `. Удалится ${formatDay(deletesAt)}`}`);
  return EXIT.ok;
}

function originalProblem(task: Task, original: Task): string | null {
  if (original.id === task.id) return "задача не может быть дублем самой себя";
  if (original.projectId !== task.projectId) return `${original.id} из другого проекта`;
  if (isClosed(original.status)) return `${original.id} уже закрыта — закройте ${task.id} как fixed или obsolete`;
  return null;
}

async function fixCommitFound(loaded: LoadedBacklog, task: Task, reason: string, io: CliIo): Promise<boolean> {
  const project = loaded.projects.find((candidate) => candidate.id === task.projectId);
  const repo = project === undefined ? undefined : await findRepo(project, io.home);
  if (repo === undefined) return true;
  for (const sha of reasonHashes(reason)) if (await hasCommit(repo, sha)) return true;
  return false;
}
