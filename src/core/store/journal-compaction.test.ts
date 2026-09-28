import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { candidateEvents, episodeStates, filteredEvents } from "../journal/episodes";
import { reportBase } from "../stats/scope";
import type { CollectedCode, FixCommit } from "../code/types";
import { JOURNAL_FILE, readJournal, readJournals } from "./journal";
import { compactJournal } from "./journal-compaction";
import { loadBacklog, taskIdsOnDisk } from "./load";
import { PROJECT_FILE } from "./paths";
import { reportsOf } from "./testing/compaction-reports";
import { makeTempDir, projectFile, writeFiles } from "./testing/temp-dirs";

const NOW = new Date("2026-09-27T12:00:00+03:00");
const repoWithUnits = { commits: [], lines: [], units: [{ date: "2026-09-06T10:00:00+03:00", lines: 100 }] };
const CODE: CollectedCode = {
  projects: [
    { projectId: "spa", name: "spa", repos: [repoWithUnits] },
    { projectId: "ti", name: "ti", repos: [repoWithUnits] },
  ],
  unavailableRepos: [],
  fixCommits: new Map([
    ["spa abc1234", { date: "2026-09-05T09:00:00+03:00", byAgent: true, lines: 12, testLines: 4 }],
    ...[1, 2, 3, 4].map((lines): [string, FixCommit] => [`ti aaa000${lines}`, { date: "2026-09-01T09:00:00+03:00", byAgent: true, lines, testLines: 0 }]),
    ["ti bbb0008", { date: "2026-09-08T09:00:00+03:00", byAgent: true, lines: 100, testLines: 0 }],
  ]),
};

const at = (day: string) => `${day}T10:00:00+03:00`;
const created = (task: string, day: string, type = "task") => ({ at: at(day), task, via: "cli", kind: "created", type, priority: "medium", tags: [] });
const status = (task: string, day: string, from: string, to: string, resolution?: string) => ({ at: at(day), task, via: "cli", kind: "status", from, to, resolution });
const candidate = (task: string, day: string, evidence: string) => ({ at: at(day), task, via: "check", kind: "candidate", evidence, mode: "full" });
const candidateGone = (task: string, day: string, evidence: string) => ({ at: at(day), task, via: "check", kind: "candidate-gone", evidence });
const candidateFiltered = (task: string, day: string, symbol: string) => ({ at: at(day), task, via: "check", kind: "candidate-filtered", symbol });
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
  created("SPA-9", "2026-02-10"),
  created("SPA-5", "2026-02-15"),
  created("SPA-8", "2026-02-20"),
  created("SPA-6", "2026-02-25"),
  status("SPA-1", "2026-03-01", "backlog", "in-progress"),
  status("SPA-5", "2026-03-01", "backlog", "in-progress"),
  status("SPA-9", "2026-03-01", "backlog", "in-progress"),
  candidate("SPA-5", "2026-03-02", "source-changed"),
  candidate("SPA-8", "2026-03-05", "source-changed"),
  status("SPA-8", "2026-03-06", "backlog", "done", "fixed"),
  { ...status("SPA-8", "2026-03-07", "done", "backlog"), undo: true },
  "не json",
  status("SPA-3", "2026-03-10", "backlog", "done", "fixed"),
  deleted("SPA-3", "2026-03-17", { status: "done", created: at("2026-02-05"), closed: at("2026-03-10"), resolution: "fixed", reason: "готово" }),
  status("SPA-6", "2026-03-12", "backlog", "done", "fixed"),
  deleted("SPA-6", "2026-03-18", { status: "done", created: at("2026-02-25"), closed: at("2026-03-12"), resolution: "fixed", reason: "abc1234" }),
  created("SPA-4", "2026-04-01"),
  candidate("SPA-1", "2026-04-10", "source-changed"),
  candidateGone("SPA-1", "2026-04-20", "source-changed"),
  verified("SPA-1", "2026-05-01"),
  candidate("SPA-2", "2026-05-15", "source-changed"),
  created("SPA-7", "2026-07-20"),
  status("SPA-1", "2026-08-01", "in-progress", "blocked"),
  candidate("SPA-1", "2026-09-01", "duplicate"),
  status("SPA-4", "2026-09-05", "backlog", "done", "fixed"),
  status("SPA-7", "2026-09-06", "backlog", "done", "fixed"),
  deleted("SPA-4", "2026-09-12", { status: "done", created: at("2026-04-01"), closed: at("2026-09-05"), resolution: "fixed", reason: "abc1234" }),
  "сломано",
];

const TI_JOURNAL = [
  created("TI-1", "2026-01-01", "epic"),
  deleted("TI-1", "2026-01-20", { type: "epic", status: "cancelled", created: at("2026-01-01"), closed: at("2026-01-20"), resolution: "obsolete", reason: "не нужен" }),
  created("TI-8", "2026-02-01"),
  candidateFiltered("TI-8", "2026-02-15", "legacySymbol"),
  status("TI-8", "2026-03-01", "backlog", "done", "fixed"),
  deleted("TI-8", "2026-03-05", { status: "done", category: "bug", created: at("2026-02-01"), closed: at("2026-03-01"), resolution: "fixed", reason: "bbb0008" }),
  status("TI-2", "2026-03-19", "backlog", "done", "fixed"),
  deleted("TI-2", "2026-03-20", { status: "done", created: at("2025-11-01"), closed: at("2026-03-19"), resolution: "fixed", reason: "готово" }),
  created("TI-9", "2026-08-01"),
  status("TI-9", "2026-09-08", "backlog", "done", "fixed"),
  created("TI-3", "2026-09-10"),
  deleted("TI-9", "2026-09-15", { status: "done", category: "bloaters", created: at("2026-08-01"), closed: at("2026-09-08"), resolution: "fixed", reason: "bbb0008" }),
];

const TI_BUG_FIXES = Object.fromEntries(
  [1, 2, 3, 4].map((index) => [join("ti", `TI-${index + 3}.md`), taskText(`TI-${index + 3}`, "2026-07-15", `category: bug\nstatus: done\nclosed: ${at("2026-09-01")}\nresolution: fixed\nreason: aaa000${index}\n`)]),
);

async function spaProject(journal: readonly unknown[] = SPA_JOURNAL): Promise<{ root: string; dir: string }> {
  const root = await makeTempDir();
  await writeFiles(root, {
    [join("spa", PROJECT_FILE)]: projectFile("SPA"),
    [join("spa", "SPA-1.md")]: taskText("SPA-1", "2026-01-10", `status: blocked\nsource: src/a.ts\nverified: ${at("2026-05-01")}\n`),
    [join("spa", "SPA-2.md")]: taskText("SPA-2", "2026-02-01", "source: src/b.ts\n"),
    [join("spa", "SPA-7.md")]: taskText("SPA-7", "2026-07-20", `status: done\nclosed: ${at("2026-09-06")}\nresolution: fixed\nreason: abc1234\n`),
    [join("spa", "SPA-8.md")]: taskText("SPA-8", "2026-02-20", "source: src/c.ts\n"),
    [join("spa", "SPA-9.md")]: "---\nid: SPA-9\nstatus: in-progress\n---\n",
    [join("spa", JOURNAL_FILE)]: journalText(journal),
  });
  return { root, dir: join(root, "spa") };
}

async function addTiProject(root: string): Promise<string> {
  await writeFiles(root, {
    [join("ti", PROJECT_FILE)]: projectFile("TI"),
    [join("ti", "TI-3.md")]: taskText("TI-3", "2026-09-10", "category: bug\n"),
    ...TI_BUG_FIXES,
    [join("ti", JOURNAL_FILE)]: journalText(TI_JOURNAL),
  });
  return join(root, "ti");
}

const reports = (root: string) => reportsOf(root, ["spa", "ti"], NOW, CODE);

async function compact(dir: string): Promise<number> {
  return compactJournal(dir, await taskIdsOnDisk(dir), NOW);
}

const journalLines = async (dir: string) => (await readFile(join(dir, JOURNAL_FILE), "utf8")).split("\n").filter((line) => line !== "");

describe("уплотнение журнала проекта", () => {
  it("отчёты до и после уплотнения совпадают", async () => {
    const { root, dir } = await spaProject();
    const tiDir = await addTiProject(root);
    const before = await reports(root);

    const removed = (await compact(dir)) + (await compact(tiDir));

    expect(removed).toBeGreaterThan(0);
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
      ["SPA-3", "created", "2026-02-05"],
      ["SPA-9", "created", "2026-02-10"],
      ["SPA-8", "created", "2026-02-20"],
      ["SPA-1", "status", "2026-03-01"],
      ["SPA-9", "status", "2026-03-01"],
      ["SPA-8", "candidate", "2026-03-05"],
      ["SPA-8", "status", "2026-03-06"],
      ["SPA-8", "status", "2026-03-07"],
      ["SPA-3", "deleted", "2026-03-17"],
      ["SPA-4", "created", "2026-04-01"],
      ["SPA-2", "candidate", "2026-05-15"],
      ["SPA-7", "created", "2026-07-20"],
      ["SPA-1", "status", "2026-08-01"],
      ["SPA-1", "candidate", "2026-09-01"],
      ["SPA-4", "status", "2026-09-05"],
      ["SPA-7", "status", "2026-09-06"],
      ["SPA-4", "deleted", "2026-09-12"],
    ]);
    expect(removed).toBe(11);
    expect(lines).not.toContain("не json");
    expect(lines.at(-1)).toBe("сломано");
  });

  it("открытый эпизод кандидата переживает уплотнение — следующая проверка его не повторит", async () => {
    const { dir } = await spaProject();

    await compact(dir);

    const { events } = await readJournal(dir, "spa");
    const sightings = [{ task: "SPA-2", evidence: "source-changed" as const }, { task: "SPA-8", evidence: "source-changed" as const }];
    expect(candidateEvents(sightings, episodeStates(events), NOW, "changed")).toEqual([]);
  });

  it("открытый эпизод отсева переживает уплотнение — следующая проверка его не повторит", async () => {
    const { dir } = await spaProject([...SPA_JOURNAL, candidateFiltered("SPA-2", "2026-05-20", "uploadFile")]);

    await compact(dir);

    const { events } = await readJournal(dir, "spa");
    expect(filteredEvents([{ task: "SPA-2", symbol: "uploadFile" }], episodeStates(events), NOW)).toEqual([]);
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

  it("без каталога проекта или без журнала уплотнять нечего", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { [join("spa", PROJECT_FILE)]: projectFile("SPA") });

    expect(await compactJournal(join(root, "gone"), new Set(), NOW)).toBe(0);
    expect(await compactJournal(join(root, "spa"), new Set(), NOW)).toBe(0);
    expect(await readdir(join(root, "spa"))).toEqual([PROJECT_FILE]);
  });
});
