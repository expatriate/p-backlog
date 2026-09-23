import { describe, expect, it } from "vitest";
import type { Candidate } from "../core/check/candidates";
import { attributeLine, newTranscriptState } from "../core/stats/cost/attribute";
import { STOP_REASON_LIMIT, stopReason } from "./stop-reason";

function changed(id: string, path: string): Candidate {
  return { kind: "source-changed", task: { id, title: id }, path, commits: [], uncommitted: true };
}

describe("stopReason", () => {
  it("перечисляет задачи с уликой и отсылает к скиллу", () => {
    const candidates: Candidate[] = [
      changed("SPA-4", "src/upload/client.ts"),
      { kind: "source-missing", task: { id: "SPA-7", title: "x" }, path: "src/old.ts" },
      { kind: "source-missing", task: { id: "SPA-8", title: "x" }, path: "src/a.ts", renamedTo: "src/b.ts" },
    ];

    expect(stopReason("spa", candidates)).toBe(
      "Беклог spa: после последней проверки менялся код задач — SPA-4 (изменён src/upload/client.ts); SPA-7 (нет файла src/old.ts); " +
        "SPA-8 (src/a.ts переименован в src/b.ts). Перепроверь их по скиллу backlog, раздел «Перепроверить задачи».",
    );
  });

  it("укладывается в лимит Claude Code и говорит, сколько задач не поместилось", () => {
    const candidates = Array.from({ length: 30 }, (_, index) => changed(`SPA-${index + 1}`, `src/features/module-${index}/very-long-file-name.ts`));

    const reason = stopReason("spa", candidates);

    expect(reason.length).toBeLessThanOrEqual(STOP_REASON_LIMIT);
    expect(reason).toMatch(/SPA-1 \(изменён .*; SPA-\d+ \(изменён [^)]+\) и ещё \d+\. Перепроверь/);
    const shown = reason.match(/SPA-\d+ \(/g)?.length ?? 0;
    expect(reason).toContain(`и ещё ${30 - shown}.`);
  });

  it("учёт затрат узнаёт по этой причине ход хука", () => {
    const feedback = `Stop hook feedback:\n${stopReason("spa", [changed("SPA-4", "src/upload/client.ts")])}`;

    const turns = attributeLine({ type: "user", isMeta: true, timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x/spa", message: { content: feedback } }, newTranscriptState());

    expect(turns).toEqual([expect.objectContaining({ kind: "hook", hookTurns: 1 })]);
  });
});
