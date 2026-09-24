import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { formatLocalIso } from "../model/dates";
import { buildIndex } from "../model/graph";
import { integrityErrors } from "../model/integrity";
import { derivePrefix, deriveProjectId, formatId, parseId, type ParsedId } from "../model/ids";
import { createdEvent, type ChangeSource, type Provenance } from "../journal/events";
import { parseProjectFile, serializeProject } from "../model/project-file";
import type { OptionalFields, Project, Task } from "../model/types";
import { createFileAtomic, hasErrorCode, listDir, readTextOrNull } from "./fs-utils";
import { appendJournal } from "./journal";
import { PROJECT_FILE, taskFileName } from "./paths";
import { issuedUpToOnDisk, readProjectFile } from "./projects";
import { taskText } from "./task-text";
import { invalid, type CreateTaskResult } from "./write-result";

type NewTaskInput = Pick<Task, "title"> &
  OptionalFields<Pick<Task, "type" | "priority" | "tags" | "epic" | "blockedBy" | "related" | "source" | "anchor" | "body" | "category">>;

export type CreateTaskRequest = {
  project: Project;
  input: NewTaskInput;
  existingTasks: readonly Task[];
  now: Date;
  via: ChangeSource;
  provenance?: Provenance;
};

const MAX_ID_ATTEMPTS = 20;

export async function createTask(root: string, request: CreateTaskRequest): Promise<CreateTaskResult> {
  const { project, existingTasks } = request;
  const dir = join(root, project.id);
  const index = buildIndex(existingTasks);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = formatId(project.prefix, await nextTaskNumber(dir, project));
    const path = join(dir, taskFileName(id));
    const normalized = taskText(draftTask(id, path, request));
    if (!normalized.ok) return invalid(normalized.problems);
    const { text, task } = normalized.value;
    const errors = integrityErrors(task, index);
    if (errors.length > 0) return invalid(errors);
    try {
      await createFileAtomic(path, text);
      await appendJournal(dir, [createdEvent(task, request.now, request.via, request.provenance)]);
      return { ok: true, task };
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) throw error;
    }
  }
  return invalid([{ code: "id-exhausted", attempts: MAX_ID_ATTEMPTS }]);
}

export async function createProject(root: string, repoRoot: string, existingProjects: readonly Project[]): Promise<Project> {
  const name = basename(repoRoot);
  const entries = await listDir(root);
  const id = deriveProjectId(name, new Set(entries.map((entry) => entry.name)));
  const prefixesOnDisk = await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => takenPrefixes(join(root, entry.name))));
  const prefix = derivePrefix(name, new Set([...existingProjects.map((project) => project.prefix), ...prefixesOnDisk.flat()]));
  const dir = join(root, id);
  await mkdir(dir, { recursive: true });
  const path = join(dir, PROJECT_FILE);
  const text = serializeProject({ name, prefix, repos: [repoRoot], active: true, extra: {}, body: "" });
  try {
    await createFileAtomic(path, text);
  } catch (error) {
    const concurrent = hasErrorCode(error, "EEXIST") ? await projectOfRepo(id, path, repoRoot) : null;
    if (concurrent === null) throw error;
    return concurrent;
  }
  const parsed = parseProjectFile(text, { id, path });
  if (!parsed.ok) throw new Error(`${path}: ${parsed.problems.map((problem) => problem.code).join(", ")}`);
  return parsed.value;
}

async function projectOfRepo(id: string, path: string, repoRoot: string): Promise<Project | null> {
  const parsed = await readProjectFile({ id, path });
  return parsed?.ok === true && parsed.value.repos.includes(repoRoot) ? parsed.value : null;
}

async function nextTaskNumber(dir: string, project: Project): Promise<number> {
  // Sweep reserves a number in project.md before deleting its file, so the directory must be listed first.
  const onDisk = await maxTaskNumber(dir, project.prefix);
  const reserved = await issuedUpToOnDisk(project);
  return Math.max(onDisk, reserved, project.issuedUpTo ?? 0) + 1;
}

async function maxTaskNumber(dir: string, prefix: string): Promise<number> {
  const numbers = (await taskFileIds(dir)).flatMap((parsed) => (parsed.prefix === prefix ? [parsed.number] : []));
  return Math.max(0, ...numbers);
}

const PREFIX_LINE = /^prefix:\s*["']?([A-Z][A-Z0-9]*)/m;

async function takenPrefixes(dir: string): Promise<string[]> {
  const declared = PREFIX_LINE.exec((await readTextOrNull(join(dir, PROJECT_FILE))) ?? "")?.[1];
  return [...(declared === undefined ? [] : [declared]), ...(await taskFileIds(dir)).map((parsed) => parsed.prefix)];
}

async function taskFileIds(dir: string): Promise<ParsedId[]> {
  return (await listDir(dir)).flatMap((entry) => parseId(entry.name.replace(/\.md$/, "")) ?? []);
}

function draftTask(id: string, path: string, { project, input, now }: CreateTaskRequest): Task {
  return {
    id,
    title: input.title,
    type: input.type ?? "task",
    status: "backlog",
    priority: input.priority ?? "medium",
    category: input.category,
    tags: input.tags ?? [],
    epic: input.epic,
    blockedBy: input.blockedBy ?? [],
    related: input.related ?? [],
    created: formatLocalIso(now),
    source: input.source,
    anchor: input.anchor,
    extra: {},
    body: input.body ?? "",
    projectId: project.id,
    path,
    version: "",
  };
}
