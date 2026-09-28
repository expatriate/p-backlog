import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CANDIDATE_EVIDENCE, candidateEvents, episodeStates, filteredEvents } from "../journal/events";
import { formatLocalIso } from "../model/dates";
import { DAY_MS } from "../model/lifecycle";
import { PRIORITIES, TASK_CATEGORIES, type TaskStatus } from "../model/types";
import type { CollectedCode, FixCommit } from "../code/types";
import { JOURNAL_FILE, readJournal } from "./journal";
import { compactJournal } from "./journal-compaction";
import { taskIdsOnDisk } from "./load";
import { PROJECT_FILE } from "./paths";
import { reportsOf } from "./testing/compaction-reports";
import { makeTempDir, projectFile, writeFiles } from "./testing/temp-dirs";

const NOW = new Date("2026-09-27T12:00:00+03:00");
const TEN_DAYS_LATER = new Date(NOW.getTime() + 10 * DAY_MS);
const HOUR_MS = 60 * 60 * 1000;
const SEEDS = Array.from({ length: 120 }, (_, index) => index + 1);
const PROJECTS = [
  { id: "gen", prefix: "GEN" },
  { id: "alt", prefix: "ALT" },
];
const SYMBOLS = ["upload", "retry", "parse"];
const HASHES = ["a1b2c3d", "b2c3d4e", "c3d4e5f", "d4e5f60", "e5f6071", "f607182"];

type Rng = { chance: (p: number) => boolean; int: (min: number, max: number) => number; pick: <T>(items: readonly T[]) => T };

function seededRng(seed: number): Rng {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return { chance: (p) => next() < p, int, pick: (items) => items[int(0, items.length - 1)] as (typeof items)[number] };
}

type Line = { at: number; text: string };
type TaskLife = { lines: Line[]; file: string | null };

const iso = (ms: number) => formatLocalIso(new Date(ms));
const isClosedStatus = (status: TaskStatus) => status === "done" || status === "cancelled";

function taskLife(rng: Rng, id: string): TaskLife {
  const lines: Line[] = [];
  const record = (at: number, event: Record<string, unknown>) => lines.push({ at, text: JSON.stringify({ at: iso(at), task: id, via: "cli", ...event }) });
  const createdAt = NOW.getTime() - rng.int(24, 240 * 24) * HOUR_MS;
  const category = rng.chance(0.6) ? rng.pick(TASK_CATEGORIES) : undefined;
  let priority = rng.pick(PRIORITIES);
  let status: TaskStatus = "backlog";
  let closing: { at: number; resolution: string; reason: string } | null = null;
  let verifiedAt: number | null = null;
  record(createdAt, { kind: "created", type: "task", priority, tags: [], ...(category === undefined ? {} : { category }) });

  let at = createdAt;
  for (let step = rng.int(0, 10); step > 0; step -= 1) {
    at += rng.int(1, 30 * 24) * HOUR_MS;
    if (at >= NOW.getTime() - HOUR_MS) break;
    if (isClosedStatus(status)) {
      if (rng.chance(0.6)) break;
      const undo = rng.chance(0.5);
      record(at, { kind: "status", from: status, to: "backlog", ...(undo ? { undo: true } : {}) });
      status = "backlog";
      closing = null;
      continue;
    }
    const action = rng.int(0, 7);
    if (action === 0) {
      const to = rng.pick(["backlog", "in-progress", "blocked"] as const);
      if (to !== status) record(at, { kind: "status", from: status, to });
      status = to;
    } else if (action === 1) {
      const fixed = rng.chance(0.7);
      const resolution = fixed ? "fixed" : "obsolete";
      const to = fixed ? "done" : "cancelled";
      record(at, { kind: "status", from: status, to, resolution });
      status = to;
      closing = { at, resolution, reason: fixed ? `Исправлено в ${rng.pick(HASHES)}` : "не нужно" };
    } else if (action === 2) {
      record(at, { via: "check", kind: "candidate", evidence: rng.pick(CANDIDATE_EVIDENCE), mode: rng.pick(["full", "changed"] as const) });
    } else if (action === 3) {
      record(at, { via: "check", kind: "candidate-gone", evidence: rng.pick(CANDIDATE_EVIDENCE) });
    } else if (action === 4) {
      record(at, { via: "check", kind: "candidate-filtered", symbol: rng.pick(SYMBOLS) });
    } else if (action === 5) {
      record(at, { kind: "verified" });
      verifiedAt = at;
    } else {
      const to = rng.pick(PRIORITIES);
      if (to !== priority) record(at, { kind: "priority", from: priority, to });
      priority = to;
    }
  }

  const fields = {
    id,
    title: `Задача ${id}`,
    type: "task",
    status,
    priority,
    tags: [],
    blockedBy: [],
    related: [],
    created: iso(createdAt),
    ...(category === undefined ? {} : { category }),
    ...(verifiedAt === null ? {} : { verified: iso(verifiedAt) }),
    ...(closing === null ? {} : { closed: iso(closing.at), resolution: closing.resolution, reason: closing.reason }),
  };
  const deletedAt = closing === null ? null : closing.at + rng.int(7 * 24, 60 * 24) * HOUR_MS;
  if (deletedAt !== null && deletedAt < NOW.getTime() && rng.chance(0.6)) {
    lines.push({ at: deletedAt, text: JSON.stringify({ at: iso(deletedAt), task: id, via: "sweep", kind: "deleted", snapshot: fields }) });
    return { lines, file: null };
  }
  return { lines, file: taskFile(fields) };
}

function taskFile(fields: Record<string, unknown>): string {
  const yaml = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${yaml.join("\n")}\n---\n`;
}

function journalOf(rng: Rng, lives: readonly TaskLife[]): string {
  const lines = lives.flatMap((life) => life.lines).sort((a, b) => a.at - b.at);
  const withBroken = lines.flatMap((line) => (rng.chance(0.03) ? [{ ...line, text: "не json" }, line] : [line]));
  return withBroken.map((line) => `${line.text}\n`).join("");
}

function codeOf(rng: Rng): CollectedCode {
  const commitDay = () => iso(NOW.getTime() - rng.int(1, 150 * 24) * HOUR_MS);
  const units = Array.from({ length: 12 }, () => ({ date: commitDay(), lines: rng.int(1, 400) }));
  const fixCommits = PROJECTS.flatMap(({ id }) =>
    HASHES.map((hash): [string, FixCommit] => [`${id} ${hash}`, { date: commitDay(), byAgent: rng.chance(0.8), lines: rng.int(1, 120), testLines: rng.int(0, 30) }]),
  );
  return {
    projects: PROJECTS.map(({ id }) => ({ projectId: id, name: id, repos: [{ commits: [], lines: [], units }] })),
    unavailableRepos: [],
    fixCommits: new Map(fixCommits),
  };
}

async function generatedBacklog(seed: number): Promise<{ root: string; code: CollectedCode }> {
  const rng = seededRng(seed);
  const root = await makeTempDir();
  for (const { id, prefix } of PROJECTS) {
    const lives = Array.from({ length: rng.int(2, 9) }, (_, index) => ({ id: `${prefix}-${index + 1}`, life: taskLife(rng, `${prefix}-${index + 1}`) }));
    const files = Object.fromEntries(lives.flatMap(({ id: taskId, life }) => (life.file === null ? [] : [[join(id, `${taskId}.md`), life.file]])));
    await writeFiles(root, { [join(id, PROJECT_FILE)]: projectFile(prefix), [join(id, JOURNAL_FILE)]: journalOf(rng, lives.map(({ life }) => life)), ...files });
  }
  return { root, code: codeOf(rng) };
}

async function nextCheckWrites(root: string) {
  return Promise.all(
    PROJECTS.map(async ({ id }) => {
      const dir = join(root, id);
      const states = episodeStates((await readJournal(dir, id)).events);
      const live = [...(await taskIdsOnDisk(dir))];
      const sightings = live.flatMap((task) => CANDIDATE_EVIDENCE.map((evidence) => ({ task, evidence })));
      const filtered = live.flatMap((task) => SYMBOLS.map((symbol) => ({ task, symbol })));
      return [...candidateEvents(sightings, states, NOW, "changed"), ...filteredEvents(filtered, states, NOW)];
    }),
  );
}

async function snapshot(root: string, code: CollectedCode) {
  const projectIds = PROJECTS.map(({ id }) => id);
  return {
    now: await reportsOf(root, projectIds, NOW, code),
    tenDaysLater: await reportsOf(root, projectIds, TEN_DAYS_LATER, code),
    nextCheck: await nextCheckWrites(root),
  };
}

describe("уплотнение журнала на случайных журналах", () => {
  it("отчёты сейчас и через 10 дней и открытые эпизоды проверки не меняются", { timeout: 30_000 }, async () => {
    let removedTotal = 0;
    for (const seed of SEEDS) {
      const { root, code } = await generatedBacklog(seed);
      const before = await snapshot(root, code);

      for (const { id } of PROJECTS) removedTotal += await compactJournal(join(root, id), await taskIdsOnDisk(join(root, id)), NOW);

      expect(await snapshot(root, code), `seed ${seed}`).toEqual(before);
    }
    expect(removedTotal).toBeGreaterThan(SEEDS.length);
  });
});
