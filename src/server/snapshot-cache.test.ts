import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, projectFile, taskFile, writeFiles } from "../core/store/testing/temp-dirs";
import { createJournalSources } from "./journal-sources";
import { createRevisions } from "./revisions";
import { serverRu } from "./messages.ru";
import { createSnapshotCache } from "./snapshot-cache";

describe("снимок беклога в сервере", () => {
  it("неудачное чтение не запоминается: следующее читает диск заново", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa", "project.md"), { recursive: true });
    const snapshots = createSnapshotCache({ root, revisions: createRevisions(), journalSources: createJournalSources(root), warn: async () => undefined });

    await expect(snapshots.read()).rejects.toThrow();

    await rm(join(root, "spa", "project.md"), { recursive: true });
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1") });
    expect((await snapshots.read()).tasks.map((task) => task.id)).toEqual(["SPA-1"]);
  });

  it("сбой слушателя проектов не отклоняет чтение снимка, а уходит в предупреждение", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const warnings: string[] = [];
    const snapshots = createSnapshotCache({ root, revisions: createRevisions(), journalSources: createJournalSources(root), warn: async (text) => void warnings.push(text(serverRu)) });
    snapshots.onProjects(() => {
      throw new Error("слушатель упал");
    });

    expect((await snapshots.read()).projects.map((project) => project.id)).toEqual(["spa"]);
    expect(warnings).toEqual([expect.stringContaining("слушатель упал")]);
  });

  it("снимок, сброшенный во время загрузки, всё равно передаёт слушателям проекты, если новой загрузки не было", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    const snapshots = createSnapshotCache({ root, revisions: createRevisions(), journalSources: createJournalSources(root), warn: async () => undefined });
    const announced: string[][] = [];
    snapshots.onProjects((projects) => announced.push(projects.map((project) => project.id)));

    const loading = snapshots.read();
    snapshots.forget();
    await loading;

    expect(announced).toEqual([["spa"]]);
  });
});
