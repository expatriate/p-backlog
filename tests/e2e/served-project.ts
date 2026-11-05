import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { ProjectsResponse, TasksResponse } from "../../src/core/api/contract";
import { MINUTE_MS } from "../../src/core/model/dates";
import { serializeProject } from "../../src/core/model/project-file";
import { contentVersion } from "../../src/core/store/fs-utils";
import { taskIdsOnDisk } from "../../src/core/store/load";
import { taskFile } from "../../src/core/store/testing/task-file-text";

type ProjectState = { listed: boolean; taskVersions: Record<string, string> };

export type SeededTask = { id: string; fields?: Record<string, string>; body?: string };

const SYNCED = "synced";

export async function writeServedProject(request: APIRequestContext, projectDir: string, { prefix, tasks = [] }: { prefix: string; tasks?: readonly SeededTask[] }): Promise<void> {
  await mkdir(projectDir, { recursive: true });
  await writeProjectFile(projectDir, prefix);
  await Promise.all(tasks.map((task) => writeTaskFile(projectDir, task)));
  await untilServerSees(request, projectDir);
}

export async function writeProjectFile(projectDir: string, prefix: string): Promise<void> {
  await writeFile(join(projectDir, "project.md"), serializeProject({ name: basename(projectDir), prefix, repos: [], active: true, extra: {}, body: "" }), "utf8");
}

export async function writeTaskFile(projectDir: string, { id, fields, body }: SeededTask): Promise<void> {
  await writeFile(join(projectDir, `${id}.md`), taskFile(id, fields, body), "utf8");
}

const SEED_START_MS = Date.parse("2026-09-10T10:00:00+03:00");

export function createdInOrder(index: number): string {
  return new Date(SEED_START_MS + index * MINUTE_MS).toISOString();
}

export async function untilServerSees(request: APIRequestContext, projectDir: string): Promise<void> {
  const projectId = basename(projectDir);
  await expect
    .poll(async () => {
      const [onDisk, served] = await Promise.all([stateOnDisk(projectDir), servedState(request, projectId)]);
      return isDeepStrictEqual(served, onDisk) ? SYNCED : { onDisk, served };
    })
    .toBe(SYNCED);
}

async function stateOnDisk(projectDir: string): Promise<ProjectState> {
  const versions = await Promise.all([...(await taskIdsOnDisk(projectDir))].map(async (id) => [id, contentVersion(await readFile(join(projectDir, `${id}.md`), "utf8"))] as const));
  return { listed: true, taskVersions: Object.fromEntries(versions) };
}

async function servedState(request: APIRequestContext, projectId: string): Promise<ProjectState | string> {
  try {
    const [{ projects }, { tasks }] = await Promise.all([okJson<ProjectsResponse>(request.get("/api/projects")), okJson<TasksResponse>(request.get("/api/tasks"))]);
    return {
      listed: projects.some((project) => project.id === projectId),
      taskVersions: Object.fromEntries(tasks.filter((task) => task.projectId === projectId).map((task) => [task.id, task.version])),
    };
  } catch (error) {
    return String(error);
  }
}

async function okJson<T>(answer: Promise<APIResponse>): Promise<T> {
  const response = await answer;
  if (!response.ok()) throw new Error(`${response.url()} answered ${response.status()}: ${await response.text()}`);
  return (await response.json()) as T;
}
