import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { formatLocalIso } from "../model/dates";
import { buildIndex } from "../model/graph";
import { integrityErrors } from "../model/integrity";
import { derivePrefix, deriveProjectId, formatId, parseId } from "../model/ids";
import { createdEvent, type ChangeSource, type Provenance } from "../journal/events";
import { parseProjectFile, serializeProject } from "../model/project-file";
import { parseTaskFile, serializeTask } from "../model/task-file";
import type { Project, Task } from "../model/types";
import { contentVersion, hasErrorCode, listDir } from "./fs-utils";
import { appendJournal } from "./journal";
import { PROJECT_FILE, taskFileName } from "./paths";
import { invalid, type CreateTaskResult } from "./write-result";

export type NewTaskInput = Pick<Task, "title"> &
  Partial<Pick<Task, "type" | "priority" | "tags" | "epic" | "blockedBy" | "related" | "source" | "body" | "category">>;

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
    const text = serializeTask(draftTask(id, path, request));
    const parsed = parseTaskFile(text, { projectId: project.id, path, version: contentVersion(text) });
    if (!parsed.ok) return invalid([parsed.message]);
    const errors = integrityErrors(parsed.value, index);
    if (errors.length > 0) return invalid(errors);
    try {
      await writeFile(path, text, { encoding: "utf8", flag: "wx" });
      await appendJournal(dir, [createdEvent(parsed.value, request.now, request.via, request.provenance)]);
      return { ok: true, task: parsed.value };
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) throw error;
    }
  }
  return invalid([`не удалось выделить ID за ${MAX_ID_ATTEMPTS} попыток`]);
}

export async function createProject(root: string, repoRoot: string, existingProjects: readonly Project[]): Promise<Project> {
  const name = basename(repoRoot);
  const takenIds = new Set((await listDir(root)).map((entry) => entry.name));
  const id = deriveProjectId(name, takenIds);
  const prefix = derivePrefix(name, new Set(existingProjects.map((project) => project.prefix)));
  const dir = join(root, id);
  await mkdir(dir, { recursive: true });
  const path = join(dir, PROJECT_FILE);
  const text = serializeProject({ name, prefix, repos: [repoRoot], extra: {}, body: "" });
  await writeFile(path, text, { encoding: "utf8", flag: "wx" });
  const parsed = parseProjectFile(text, { id, path });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value;
}

async function nextTaskNumber(dir: string, project: Project): Promise<number> {
  return Math.max(await maxTaskNumber(dir, project.prefix), project.issuedUpTo ?? 0) + 1;
}

async function maxTaskNumber(dir: string, prefix: string): Promise<number> {
  const numbers = (await listDir(dir)).flatMap((entry) => {
    const parsed = parseId(entry.name.replace(/\.md$/, ""));
    return parsed?.prefix === prefix ? [parsed.number] : [];
  });
  return Math.max(0, ...numbers);
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
    extra: {},
    body: input.body ?? "",
    projectId: project.id,
    path,
    version: "",
  };
}
