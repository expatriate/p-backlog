import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import { taskHistories } from "../history";
import type { FixCommit } from "../types";
import { fixBreakdown, fixKey, fixRequests, reasonHashes } from "./fixes";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const FROM = at(1).getTime();
const TO = at(18).getTime();
const fixed = (id: string, created: number, closed: number, reason: string) =>
  makeTask({ id, created: iso(created), status: "done", closed: iso(closed), resolution: "fixed", reason });

describe("хеши из причины", () => {
  it("короткие и полные хеши по порядку, слова из hex-букв и числа внутри слов не берутся", () => {
    expect(reasonHashes("Исправлено в 8fde4fb (ветка feat/x), см. также 0123456789abcdef0123456789abcdef01234567")).toEqual([
      "8fde4fb",
      "0123456789abcdef0123456789abcdef01234567",
    ]);
    expect(reasonHashes("deadline, facade, abc12345x, версия v1a2b3c4d")).toEqual([]);
    expect(reasonHashes(undefined)).toEqual([]);
  });
});

describe("кто исправил", () => {
  it("агент, человек и без коммита; медианы от создания до коммита; удалённая задача по снимку", () => {
    const tasks = [
      fixed("SPA-1", 1, 5, "Исправлено в aaaaaaa"),
      fixed("SPA-2", 2, 6, "Исправлено в bbbbbbb: см. ccccccc"),
      fixed("SPA-3", 3, 7, "Исправлено незакоммиченными правками"),
      makeTask({ id: "SPA-4", created: iso(3), status: "done", closed: iso(8) }),
    ];
    const snapshot = { ...fixed("SPA-5", 4, 9, "Исправлено в ddddddd") };
    const deleted: JournalEvent = {
      at: iso(16),
      task: "SPA-5",
      via: "sweep",
      kind: "deleted",
      snapshot: { id: snapshot.id, title: snapshot.title, type: "task", status: "done", priority: "medium", tags: [], blockedBy: [], related: [], created: snapshot.created, closed: snapshot.closed, resolution: "fixed", reason: snapshot.reason },
    };
    const histories = taskHistories(tasks, [{ projectId: "spa", events: [deleted], invalidLines: 0 }]);
    const commits = new Map<string, FixCommit>([
      [fixKey("spa", "aaaaaaa"), { date: iso(3), byAgent: true, lines: 0, testLines: 0 }],
      [fixKey("spa", "ccccccc"), { date: iso(6), byAgent: false, lines: 0, testLines: 0 }],
      [fixKey("spa", "ddddddd"), { date: iso(8), byAgent: true, lines: 0, testLines: 0 }],
    ]);

    expect(fixRequests(histories, FROM, TO)).toEqual([{ projectId: "spa", hashes: ["aaaaaaa", "bbbbbbb", "ccccccc", "ddddddd"] }]);
    expect(fixBreakdown(histories, FROM, TO, commits)).toEqual({ agent: 2, human: 1, unknown: 1, agentMedianDays: 3, humanMedianDays: 4 });
  });

  it("закрытия вне периода не считаются", () => {
    const histories = taskHistories([fixed("SPA-1", 1, 5, "Исправлено в aaaaaaa")], []);

    expect(fixBreakdown(histories, at(10).getTime(), TO, new Map())).toEqual({ agent: 0, human: 0, unknown: 0, agentMedianDays: null, humanMedianDays: null });
  });

  it("коммит раньше создания задачи — 0 дней", () => {
    const histories = taskHistories([fixed("SPA-1", 5, 6, "Исправлено в aaaaaaa")], []);
    const commits = new Map<string, FixCommit>([[fixKey("spa", "aaaaaaa"), { date: iso(1), byAgent: true, lines: 0, testLines: 0 }]]);

    expect(fixBreakdown(histories, FROM, TO, commits)).toEqual({ agent: 1, human: 0, unknown: 0, agentMedianDays: 0, humanMedianDays: null });
  });
});
