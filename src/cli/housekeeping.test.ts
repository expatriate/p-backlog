import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createdLine, journalWithTaskGoneLongAgo } from "../core/store/testing/stale-journal";
import { makeTempDir, projectFile, taskFile, writeFiles } from "../core/store/testing/temp-dirs";
import { tidyAfterCommand } from "./housekeeping";

const NOW = new Date("2026-09-27T12:00:00+03:00");
const HOUR_MS = 60 * 60 * 1000;

describe("уборка после команды CLI", () => {
  it("CLI уплотняет журнал не чаще раза в сутки", async () => {
    const root = await makeTempDir();
    const journalPath = join(root, "spa", "journal.jsonl");
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1"), "spa/journal.jsonl": journalWithTaskGoneLongAgo(NOW) });
    const warnings: string[] = [];
    const tidy = (hoursLater: number) => tidyAfterCommand({ backlogRoot: root, env: {}, now: new Date(NOW.getTime() + hoursLater * HOUR_MS), warn: (line) => void warnings.push(line) });

    await tidy(0);
    expect(await readFile(journalPath, "utf8")).not.toContain("SPA-3");

    await appendFile(journalPath, createdLine("SPA-4", NOW, 190));
    await tidy(1);
    expect(await readFile(journalPath, "utf8")).toContain("SPA-4");

    await tidy(25);
    expect(await readFile(journalPath, "utf8")).not.toContain("SPA-4");
    expect(warnings).toEqual([]);
  });
});
