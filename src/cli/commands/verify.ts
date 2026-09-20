import { parseArgs } from "node:util";
import { sourceAnchor } from "../../core/check/project-repo";
import { formatLocalIso } from "../../core/model/dates";
import { isClosed } from "../../core/model/graph";
import type { Task } from "../../core/model/types";
import { loadBacklog, type LoadedBacklog } from "../../core/store/load";
import { EXIT, UsageError, withUsageErrors, type CliIo } from "../io";
import { requireTask } from "../lookups";
import { writeTask } from "../task-write";

const USAGE = "Использование: backlog verify <ID> [<ID> …] [--source файл:строка — только для одной задачи]";

export async function runVerify(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = withUsageErrors(() =>
    parseArgs({ args, allowPositionals: true, options: { source: { type: "string" } } }),
  );
  if (positionals.length === 0) throw new UsageError(USAGE);
  const source = values.source?.trim();
  if (source === "") throw new UsageError("--source не может быть пустым");
  if (source !== undefined && positionals.length > 1) throw new UsageError(USAGE);

  const loaded = await loadBacklog(io.backlogRoot);
  let exitCode: number = EXIT.ok;
  for (const id of new Set(positionals)) {
    const code = await verifyOne(loaded, id, source, io);
    if (exitCode === EXIT.ok) exitCode = code;
  }
  return exitCode;
}

async function verifyOne(loaded: LoadedBacklog, id: string, source: string | undefined, io: CliIo): Promise<number> {
  const task = requireTask(loaded, io, id);
  if (!task) return EXIT.notFound;
  if (isClosed(task.status)) {
    io.warn(`${id} уже в статусе ${task.status}: подтверждать нечего`);
    return EXIT.refused;
  }

  const anchor = await anchorFor(loaded, task, source ?? task.source, io);
  const written = await writeTask(io, task, { verified: formatLocalIso(io.now()), source, anchor });
  if (!written.ok) return written.exitCode;
  io.print(source === undefined ? `${id}: подтверждена` : `${id}: подтверждена, source → ${source}`);
  return EXIT.ok;
}

async function anchorFor(loaded: LoadedBacklog, task: Task, source: string | undefined, io: CliIo): Promise<string | undefined> {
  const project = loaded.projects.find((candidate) => candidate.id === task.projectId);
  return project === undefined || source === undefined ? undefined : sourceAnchor(project, source, io.home);
}
