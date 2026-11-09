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
import { makeTempDir, projectFile, writeFiles } from "./testing/temp-dirs";

vi.mock("./fs-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fs-utils")>();
  return { ...actual, withFile: vi.fn(actual.withFile) };
});

const NOW = new Date("2026-09-27T12:00:00+03:00");
const COMPACTION_ONLY: MaintenancePlan = { trimRuns: async () => 0, sweepClosed: null, compactJournals: compactJournalsWhenDue, serviceLog: null };

const event = (task: string, at: string, fields: object) => JSON.stringify({ at, task, via: "cli", ...fields });
const created = (task: string, at: string) => event(task, at, { kind: "created", type: "task", priority: "medium", tags: [] });

describe("обслуживание бэклога", () => {
  it.skipIf(process.platform === "win32")("сбой синхронизации каталога после сжатия журнала — предупреждения о файлах, а не «журнал не сжат»; номера зарезервированы, отметка стоит", async () => {
    const root = await makeTempDir();
    const dir = join(root, "spa");
    const stamp = join(dir, COMPACTED_STAMP);
    const journal = [created("SPA-5", "2026-01-01T10:00:00+03:00"), created("SPA-6", "2026-01-02T10:00:00+03:00"), event("SPA-6", "2026-01-03T10:00:00+03:00", { kind: "priority", from: "medium", to: "high" })];
    await writeFiles(root, { [join("spa", PROJECT_FILE)]: projectFile("SPA"), [join("spa", JOURNAL_FILE)]: journal.map((line) => `${line}\n`).join("") });
    const warnings: string[] = [];

    await failingEvery(
      withFile,
      (path) => path === dir,
      () => runMaintenance(COMPACTION_ONLY, { root, now: NOW, messages: coreMessages("ru"), warn: (line) => warnings.push(line) }),
    );

    expect(warnings).toEqual([join(dir, PROJECT_FILE), join(dir, JOURNAL_FILE), stamp].map((path) => `${path}: injected EIO`));
    expect((await readJournal(dir, "spa")).events.map(({ task }) => task)).toEqual(["SPA-5"]);
    expect(await issuedUpToOnDisk({ id: "spa", path: join(dir, PROJECT_FILE) })).toBe(6);
    expect(await readFile(stamp, "utf8")).toBe(`${formatLocalIso(NOW)}\n`);
  });
});
