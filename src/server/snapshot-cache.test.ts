import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, projectFile, taskFile, writeFiles } from "../core/store/testing/temp-dirs";
import { createJournalSources } from "./journal-sources";
import { createRevisions } from "./revisions";
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
});
