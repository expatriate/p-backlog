import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { candidateEvents, episodeStates } from "../journal/events";
import { effectReport } from "../stats/effect/effect-report";
import { qualityReport } from "../stats/quality/quality-report";
import { statsReport } from "../stats/report";
import { reportBase, type StatsInput } from "../stats/scope";
import { statsSignals } from "../stats/signals/signals";
import type { CollectedCode } from "../stats/types";
import { JOURNAL_FILE, readJournal, readJournals } from "./journal";
import { compactJournal } from "./journal-compaction";
import { loadBacklog, taskIdsOnDisk } from "./load";
import { PROJECT_FILE } from "./paths";
import { makeTempDir, projectFile, writeFiles } from "./testing/temp-dirs";

const NOW = new Date("2026-09-27T12:00:00+03:00");
const FILE_COUNTERS = { taskCount: 0, invalidJournalLines: 0, unknownJournalLines: 0 };
const CODE: CollectedCode = {
  projects: [{ projectId: "spa", name: "spa", repos: [{ commits: [], lines: [], units: [{ date: "2026-09-06T10:00:00+03:00", lines: 100 }] }] }],
  unavailableRepos: [],
  fixCommits: new Map([["spa abc1234", { date: "2026-09-05T09:00:00+03:00", byAgent: true, lines: 12, testLines: 4 }]]),
};

const at = (day: string) => `${day}T10:00:00+03:00`;
const created = (task: string, day: string) => ({ at: at(day), task, via: "cli", kind: "created", type: "task", priority: "medium", tags: [] });
const status = (task: string, day: string, from: string, to: string, resolution?: string) => ({ at: at(day), task, via: "cli", kind: "status", from, to, resolution });
const candidate = (task: string, day: string, evidence: string) => ({ at: at(day), task, via: "check", kind: "candidate", evidence, mode: "full" });
const candidateGone = (task: string, day: string, evidence: string) => ({ at: at(day), task, via: "check", kind: "candidate-gone", evidence });
const verified = (task: string, day: string) => ({ at: at(day), task, via: "cli", kind: "verified" });
const deleted = (task: string, day: string, snapshot: Record<string, unknown>) => ({
  at: at(day),
  task,
  via: "sweep",
  kind: "deleted",
  snapshot: { id: task, title: `Задача ${task}`, type: "task", priority: "medium", tags: [], blockedBy: [], related: [], ...snapshot },
});

const journalText = (lines: readonly unknown[]) => lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n");

const taskText = (id: string, createdDay: string, fields = "") => `---\nid: ${id}\ntitle: Задача ${id}\ncreated: ${at(createdDay)}\n${fields}---\n`;

const SPA_JOURNAL = [
  created("SPA-1", "2026-01-10"),
  created("SPA-2", "2026-02-01"),
  created("SPA-3", "2026-02-05"),
  created("SPA-5", "2026-02-15"),
  status("SPA-1", "2026-03-01", "backlog", "in-progress"),
  status("SPA-5", "2026-03-01", "backlog", "in-progress"),
  "не json",
  status("SPA-3", "2026-03-10", "backlog", "done", "fixed"),
  deleted("SPA-3", "2026-03-17", { status: "done", created: at("2026-02-05"), closed: at("2026-03-10"), resolution: "fixed", reason: "готово" }),
  created("SPA-4", "2026-04-01"),
  candidate("SPA-1", "2026-04-10", "source-changed"),
  candidateGone("SPA-1", "2026-04-20", "source-changed"),
  verified("SPA-1", "2026-05-01"),
  candidate("SPA-2", "2026-05-15", "source-changed"),
  candidate("SPA-1", "2026-09-01", "duplicate"),
  status("SPA-4", "2026-09-05", "backlog", "done", "fixed"),
  deleted("SPA-4", "2026-09-12", { status: "done", created: at("2026-04-01"), closed: at("2026-09-05"), resolution: "fixed", reason: "abc1234" }),
  "сломано",
];

async function spaProject(journal: readonly unknown[] = SPA_JOURNAL): Promise<{ root: string; dir: string }> {
  const root = await makeTempDir();
  await writeFiles(root, {
    [join("spa", PROJECT_FILE)]: projectFile("SPA"),
    [join("spa", "SPA-1.md")]: taskText("SPA-1", "2026-01-10", `status: in-progress\nsource: src/a.ts\nverified: ${at("2026-05-01")}\n`),
    [join("spa", "SPA-2.md")]: taskText("SPA-2", "2026-02-01", "source: src/b.ts\n"),
    [join("spa", JOURNAL_FILE)]: journalText(journal),
  });
  return { root, dir: join(root, "spa") };
}

async function reports(root: string) {
  const { tasks } = await loadBacklog(root);
  const input: StatsInput = { tasks, journals: await readJournals(root, ["spa"]), now: NOW };
  const base = reportBase(input);
  return {
    stats: { ...statsReport(input, base), ...FILE_COUNTERS },
    quality: { ...qualityReport(input, base, []), ...FILE_COUNTERS },
    signals: statsSignals(input, base),
    effect: { ...effectReport({ ...input, code: CODE }, base), ...FILE_COUNTERS },
  };
}

async function compact(dir: string): Promise<number> {
  return compactJournal(dir, await taskIdsOnDisk(dir), NOW);
}

const journalLines = async (dir: string) => (await readFile(join(dir, JOURNAL_FILE), "utf8")).split("\n").filter((line) => line !== "");

describe("уплотнение журнала проекта", () => {
  it("отчёты до и после уплотнения совпадают", async () => {
    const { root, dir } = await spaProject();
    const before = await reports(root);

    await compact(dir);

    expect(await reports(root)).toEqual(before);
  });

  it("события задач, исчезнувших до окна, и старые события эпизодов уходят, история живых задач остаётся", async () => {
    const { dir } = await spaProject();

    const removed = await compact(dir);

    const lines = await journalLines(dir);
    const events = (await readJournal(dir, "spa")).events.map((event) => [event.task, event.kind, event.at.slice(0, 10)]);
    expect(events).toEqual([
      ["SPA-1", "created", "2026-01-10"],
      ["SPA-2", "created", "2026-02-01"],
      ["SPA-1", "status", "2026-03-01"],
      ["SPA-4", "created", "2026-04-01"],
      ["SPA-2", "candidate", "2026-05-15"],
      ["SPA-1", "candidate", "2026-09-01"],
      ["SPA-4", "status", "2026-09-05"],
      ["SPA-4", "deleted", "2026-09-12"],
    ]);
    expect(removed).toBe(9);
    expect(lines).not.toContain("не json");
    expect(lines.at(-1)).toBe("сломано");
  });

  it("открытый эпизод кандидата переживает уплотнение — следующая проверка его не повторит", async () => {
    const { dir } = await spaProject();

    await compact(dir);

    const { events } = await readJournal(dir, "spa");
    expect(candidateEvents([{ task: "SPA-2", evidence: "source-changed" }], episodeStates(events), NOW, "changed")).toEqual([]);
  });

  it("самое раннее событие остаётся, даже если задача исчезла до окна: «Журнал ведётся с» не сдвигается", async () => {
    const { root, dir } = await spaProject([
      created("SPA-3", "2026-01-05"),
      created("SPA-1", "2026-01-10"),
      status("SPA-3", "2026-03-10", "backlog", "done", "fixed"),
      deleted("SPA-3", "2026-03-17", { status: "done", created: at("2026-01-05"), closed: at("2026-03-10"), resolution: "fixed" }),
    ]);
    const journalSince = async () => {
      const { tasks } = await loadBacklog(root);
      return reportBase({ tasks, journals: await readJournals(root, ["spa"]), now: NOW }).head.journalSince;
    };
    const before = await journalSince();

    await compact(dir);

    expect(await journalSince()).toBe(before);
  });

  it("журнал без старого не переписывается", async () => {
    const { dir } = await spaProject([created("SPA-1", "2026-07-10"), candidate("SPA-1", "2026-09-01", "duplicate")]);
    const path = join(dir, JOURNAL_FILE);
    const before = await stat(path);

    const removed = await compact(dir);

    expect(removed).toBe(0);
    expect((await stat(path)).mtimeMs).toBe(before.mtimeMs);
  });
});
