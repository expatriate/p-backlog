import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createdLine, journalWithTaskGoneLongAgo } from "../core/store/testing/stale-journal";
import { makeTempDir, projectFile, taskFile, writeFiles } from "../core/store/testing/temp-dirs";
import { tidyAfterCommand } from "./housekeeping";

const NOW = new Date("2026-09-27T12:00:00+03:00");
const HOUR_MS = 60 * 60 * 1000;

async function backlogWithStaleJournal(): Promise<{ root: string; journalPath: string }> {
  const root = await makeTempDir();
  await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1"), "spa/journal.jsonl": journalWithTaskGoneLongAgo(NOW) });
  return { root, journalPath: join(root, "spa", "journal.jsonl") };
}

function tidyIn(root: string, warnings: string[] = []) {
  return (argv: readonly string[], hoursLater = 0) => tidyAfterCommand({ backlogRoot: root, argv, env: {}, now: new Date(NOW.getTime() + hoursLater * HOUR_MS), warn: (line) => void warnings.push(line) });
}

describe("уборка после команды CLI", () => {
  it("CLI уплотняет журнал не чаще раза в сутки", async () => {
    const { root, journalPath } = await backlogWithStaleJournal();
    const warnings: string[] = [];
    const tidy = tidyIn(root, warnings);

    await tidy(["list"]);
    expect(await readFile(journalPath, "utf8")).not.toContain("SPA-3");

    await appendFile(journalPath, createdLine("SPA-4", NOW, 190));
    await tidy(["list"], 1);
    expect(await readFile(journalPath, "utf8")).toContain("SPA-4");

    await tidy(["list"], 25);
    expect(await readFile(journalPath, "utf8")).not.toContain("SPA-4");
    expect(warnings).toEqual([]);
  });

  it("хук хода агента не уплотняет журналы и не ставит отметку — это делает следующая обычная команда", async () => {
    const { root, journalPath } = await backlogWithStaleJournal();
    const before = await readFile(journalPath, "utf8");
    const tidy = tidyIn(root);

    await tidy(["hook", "stop"]);
    expect(await readFile(journalPath, "utf8")).toBe(before);
    expect(await readdir(join(root, "spa"))).not.toContain(".journal-compacted-at");

    await tidy(["show", "SPA-1"]);
    expect(await readFile(journalPath, "utf8")).not.toContain("SPA-3");
  });

  it("сбой уплотнения одного проекта не мешает остальным, предупреждение называет сломанный проект", async () => {
    const { root, journalPath } = await backlogWithStaleJournal();
    await writeFiles(root, { "aaa/project.md": projectFile("AAA") });
    await mkdir(join(root, "aaa", "journal.jsonl"));
    const warnings: string[] = [];

    await tidyIn(root, warnings)(["list"]);

    expect(await readFile(journalPath, "utf8")).not.toContain("SPA-3");
    expect(warnings).toEqual([expect.stringContaining(join(root, "aaa"))]);
  });
});
