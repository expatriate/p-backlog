import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, projectFile, taskFile, writeFiles } from "../core/store/testing/temp-dirs";
import { updateTask } from "../core/store/testing/update-task";
import { createJournalSources } from "./journal-sources";
import { createRevisions } from "./revisions";
import { createInvalidation, createSnapshotCache, type IndexedBacklog } from "./snapshot-cache";
import { makeTestChangeFeed } from "./testing/change-feed";
import { TEST_NOW } from "./testing/test-app";

function makeSnapshots(root: string) {
  const revisions = createRevisions();
  const snapshots = createSnapshotCache({ root, revisions, journalSources: createJournalSources(root), warn: async () => undefined });
  const { changes, emitChange } = makeTestChangeFeed();
  const invalidation = createInvalidation({ revisions, snapshots, derived: { forgetAll: () => undefined, forgetChanged: () => undefined }, changes });
  return { snapshots, invalidation, emitChange };
}

async function backlogDir(): Promise<string> {
  const root = await makeTempDir();
  await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1") });
  return root;
}

const priorityOf = ({ tasks }: IndexedBacklog, id: string) => tasks.find((task) => task.id === id)?.priority;

describe("снимок беклога в сервере", () => {
  it("после чужого изменения на диске следующее чтение отдаёт диск", async () => {
    const root = await backlogDir();
    const { snapshots, emitChange } = makeSnapshots(root);
    expect(priorityOf(await snapshots.read(), "SPA-1")).toBe("medium");

    await writeFiles(root, { "spa/SPA-1.md": taskFile("SPA-1", "priority: critical\n") });
    await emitChange([join(root, "spa", "SPA-1.md")]);

    expect(priorityOf(await snapshots.read(), "SPA-1")).toBe("critical");
  });

  it("после своей записи следующее чтение отдаёт диск", async () => {
    const root = await backlogDir();
    const { snapshots, invalidation } = makeSnapshots(root);
    await snapshots.read();

    const written = await updateTask(root, { id: "SPA-1", changes: { priority: "low" }, now: TEST_NOW, via: "web" });
    if (!written.ok) throw new Error(`правка не прошла: ${written.reason}`);
    await invalidation.recordOwnWrites([written.task]);
    expect(priorityOf(await snapshots.read(), "SPA-1")).toBe("low");
  });

  it("неудачное чтение не запоминается: следующее читает диск заново", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa", "project.md"), { recursive: true });
    const { snapshots } = makeSnapshots(root);

    await expect(snapshots.read()).rejects.toThrow();

    await rm(join(root, "spa", "project.md"), { recursive: true });
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1") });
    expect((await snapshots.read()).tasks.map((task) => task.id)).toEqual(["SPA-1"]);
  });
});
