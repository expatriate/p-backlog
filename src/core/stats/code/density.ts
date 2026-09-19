import type { Task } from "../../model/types";
import { folderOf } from "../breakdowns";
import { countBy } from "../numbers";
import type { CodeDensity, DensityRow, FolderDensity, ProjectCode, ProjectDensity } from "../types";

const FOLDER_LIMIT = 8;
const MIN_FOLDER_LINES = 500;
const LINES_PER_UNIT = 1000;

export function density(openTasks: readonly Task[], projects: readonly ProjectCode[], projectId: string | undefined): CodeDensity {
  const projectRows = projects
    .filter((project) => project.repos.length > 0)
    .map((project): ProjectDensity => {
      const lines = project.repos.flatMap((repo) => repo.lines).reduce((sum, file) => sum + file.lines, 0);
      return { projectId: project.projectId, name: project.name, ...densityRow(lines, openTasks.filter((task) => task.projectId === project.projectId).length) };
    })
    .sort((a, b) => byDensity(a, b) || a.projectId.localeCompare(b.projectId));
  const scoped = projectId === undefined ? undefined : projects.find((project) => project.projectId === projectId);
  return { projects: projectRows, folders: scoped === undefined ? [] : folderRows(scoped, openTasks) };
}

function folderRows(project: ProjectCode, openTasks: readonly Task[]): FolderDensity[] {
  const lines = countBy(
    project.repos.flatMap((repo) => repo.lines),
    (file) => folderOf(file.path),
    (file) => file.lines,
  );
  const ownTasks = openTasks.filter((task) => task.projectId === project.projectId && task.source !== undefined);
  const open = countBy(ownTasks, (task) => folderOf(task.source ?? ""));
  return [...open.entries()]
    .flatMap(([label, count]) => {
      const folderLines = lines.get(label) ?? 0;
      return folderLines >= MIN_FOLDER_LINES ? [{ label, ...densityRow(folderLines, count) }] : [];
    })
    .sort((a, b) => byDensity(a, b) || a.label.localeCompare(b.label))
    .slice(0, FOLDER_LIMIT);
}

function densityRow(lines: number, open: number): DensityRow {
  return { lines, open, perKloc: lines === 0 ? null : (open * LINES_PER_UNIT) / lines };
}

function byDensity(a: DensityRow, b: DensityRow): number {
  return (b.perKloc ?? -1) - (a.perKloc ?? -1);
}
