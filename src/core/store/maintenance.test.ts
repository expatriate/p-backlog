import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { formatLocalIso } from "../model/dates";
import { coreMessages } from "../messages";
import { withFile } from "./fs-utils";
import { JOURNAL_FILE, readJournal } from "./journal";
import { COMPACTED_STAMP, compactJournalsWhenDue } from "./journal-compaction";
import { runMaintenance, type MaintenancePlan } from "./maintenance";
import { issuedUpToOnDisk } from "./projects";
import { PROJECT_FILE } from "./paths";
import { failingEvery } from "./testing/fs-failures";
import { failingLockRelease } from "./testing/locks";
import { makeTempDir, projectFile, writeFiles } from "./testing/temp-dirs";

vi.mock("./fs-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fs-utils")>();
  return { ...actual, withFile: vi.fn(actual.withFile), readTextOrNull: vi.fn(actual.readTextOrNull) };
});

const NOW = new Date("2026-09-27T12:00:00+03:00");
const COMPACTION_ONLY: MaintenancePlan = { trimRuns: async () => 0, sweepClosed: null, compactJournals: compactJournalsWhenDue, serviceLog: null };

const event = (task: string, at: string, fields: object) => JSON.stringify({ at, task, via: "cli", ...fields });
const created = (task: string, at: string) => event(task, at, { kind: "created", type: "task", priority: "medium", tags: [] });

type CompactionRun = { dir: string; stamp: string; maintain: () => Promise<unknown>; warnings: string[] };

async function projectWithOldJournal(): Promise<CompactionRun> {
  const root = await makeTempDir();
  const dir = join(root, "spa");
  const journal = [created("SPA-5", "2026-01-01T10:00:00+03:00"), created("SPA-6", "2026-01-02T10:00:00+03:00"), event("SPA-6", "2026-01-03T10:00:00+03:00", { kind: "priority", from: "medium", to: "high" })];
  await writeFiles(root, { [join("spa", PROJECT_FILE)]: projectFile("SPA"), [join("spa", JOURNAL_FILE)]: journal.map((line) => `${line}\n`).join("") });
  const warnings: string[] = [];
  const maintain = () => runMaintenance(COMPACTION_ONLY, { root, now: NOW, messages: coreMessages("ru"), warn: (line) => warnings.push(line) });
  return { dir, stamp: join(dir, COMPACTED_STAMP), maintain, warnings };
}

async function expectCompactedAndStamped({ dir, stamp }: CompactionRun): Promise<void> {
  expect((await readJournal(dir, "spa")).events.map(({ task }) => task)).toEqual(["SPA-5"]);
  expect(await issuedUpToOnDisk({ id: "spa", path: join(dir, PROJECT_FILE) })).toBe(6);
  expect(await readFile(stamp, "utf8")).toBe(`${formatLocalIso(NOW)}\n`);
}

describe("обслуживание бэклога", () => {
  it.skipIf(process.platform === "win32")("сбой синхронизации каталога после сжатия журнала — предупреждения о файлах, а не «журнал не сжат»; номера зарезервированы, отметка стоит", async () => {
    const run = await projectWithOldJournal();

    await failingEvery(withFile, (path) => path === run.dir, run.maintain);

    expect(run.warnings).toEqual([join(run.dir, PROJECT_FILE), join(run.dir, JOURNAL_FILE), run.stamp].map((path) => `${path}: injected EIO`));
    await expectCompactedAndStamped(run);
  });

  it.each([JOURNAL_FILE, COMPACTED_STAMP])("сбой снятия блокировки %s после сжатия журнала — предупреждение о файле, а не «журнал не сжат»; номера зарезервированы, отметка стоит", async (locked) => {
    const run = await projectWithOldJournal();

    await failingLockRelease(join(run.dir, locked), run.maintain);

    expect(run.warnings).toEqual([`${join(run.dir, locked)}: injected EIO`]);
    await expectCompactedAndStamped(run);
  });
});
