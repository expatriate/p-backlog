import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DAY_MS, formatLocalIso } from "../core/model/dates";
import { appendRun } from "../core/store/runs";
import { SWEPT_AT_FILE } from "../core/store/sweep";
import { readRuns } from "../core/store/testing/runs";
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
  return (command: string, hoursLater = 0) => tidyAfterCommand({ backlogRoot: root, command, language: "ru", now: new Date(NOW.getTime() + hoursLater * HOUR_MS), warn: (line) => void warnings.push(line) });
}

describe("уборка после команды CLI", () => {
  it("CLI уплотняет журнал не чаще раза в сутки", async () => {
    const { root, journalPath } = await backlogWithStaleJournal();
    const warnings: string[] = [];
    const tidy = tidyIn(root, warnings);

    await tidy("list");
    expect(await readFile(journalPath, "utf8")).not.toContain("SPA-3");

    await appendFile(journalPath, createdLine("SPA-4", NOW, 190));
    await tidy("list", 1);
    expect(await readFile(journalPath, "utf8")).toContain("SPA-4");

    await tidy("list", 25);
    expect(await readFile(journalPath, "utf8")).not.toContain("SPA-4");
    expect(warnings).toEqual([]);
  });

  it("хук хода агента не уплотняет журналы и не ставит отметку — это делает следующая обычная команда", async () => {
    const { root, journalPath } = await backlogWithStaleJournal();
    const before = await readFile(journalPath, "utf8");
    const tidy = tidyIn(root);

    await tidy("hook stop");
    expect(await readFile(journalPath, "utf8")).toBe(before);
    expect(await readdir(join(root, "spa"))).not.toContain(".journal-compacted-at");

    await tidy("show");
    expect(await readFile(journalPath, "utf8")).not.toContain("SPA-3");
  });

  it("хук хода агента обрезает устаревший журнал запусков — иначе без службы он растёт с каждым ходом", async () => {
    const root = await makeTempDir();
    const run = (daysAgo: number, command: string) => ({ at: formatLocalIso(new Date(NOW.getTime() - daysAgo * DAY_MS)), command, cwd: "/repo", ms: 1, rssMb: 1, exitCode: 0 });
    await appendRun(root, run(200, "old"));
    await appendRun(root, run(1, "recent"));

    await tidyIn(root)("hook stop");

    expect((await readRuns(root)).map(({ command }) => command)).toEqual(["recent"]);
  });

  it("закрытая больше 7 дней назад задача удаляется после команды CLI, повтор в тот же день уборку не запускает", async () => {
    const root = await makeTempDir();
    const closedDaysAgo = (days: number) => formatLocalIso(new Date(NOW.getTime() - days * DAY_MS));
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), "spa/SPA-1.md": taskFile("SPA-1", `status: done\nclosed: ${closedDaysAgo(10)}\n`) });
    const tidy = tidyIn(root);

    await tidy("list");

    await expect(readFile(join(root, "spa", "SPA-1.md"), "utf8")).rejects.toThrow();
    expect(await readFile(join(root, "spa", "journal.jsonl"), "utf8")).toContain('"kind":"deleted"');
    expect(await readdir(root)).toContain(SWEPT_AT_FILE);

    await writeFiles(root, { "spa/SPA-2.md": taskFile("SPA-2", `status: done\nclosed: ${closedDaysAgo(10)}\n`) });
    await tidy("list", 1);
    await expect(readFile(join(root, "spa", "SPA-2.md"), "utf8")).resolves.toContain("SPA-2");

    await tidy("list", 25);
    await expect(readFile(join(root, "spa", "SPA-2.md"), "utf8")).rejects.toThrow();
  });

  it("уборка из CLI предупреждает о задачах, которые не смогла обновить, и о файлах, держащих эпик", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1", "type: epic\n"),
      "spa/SPA-2.md": taskFile("SPA-2", "epic: SPA-1\nstatus: done\n"),
      "spa/SPA-3.md": "сломано",
      "spa/SPA-4.md": taskFile("SPA-4", "status: done\nblockedBy: [SPA-4]\n"),
    });
    const warnings: string[] = [];

    await tidyIn(root, warnings)("list");

    expect(warnings).toEqual([expect.stringContaining(join(root, "spa", "SPA-3.md")), expect.stringContaining("SPA-4 (задача не может блокировать саму себя)")]);
  });

  it("сбой уплотнения одного проекта не мешает остальным, предупреждение называет сломанный проект", async () => {
    const { root, journalPath } = await backlogWithStaleJournal();
    await writeFiles(root, { "aaa/project.md": projectFile("AAA") });
    await mkdir(join(root, "aaa", "journal.jsonl"));
    const warnings: string[] = [];

    await tidyIn(root, warnings)("list");

    expect(await readFile(journalPath, "utf8")).not.toContain("SPA-3");
    expect(warnings).toEqual([expect.stringContaining(join(root, "aaa"))]);
  });
});
