import { describe, expect, it } from "vitest";
import type { Candidate } from "../core/check/candidates";
import { attributeLine, newTranscriptState } from "../core/stats/cost/attribute";
import { STOP_REASON_LIMIT, stopReason } from "./stop-reason";

function changed(id: string, path: string): Candidate {
  return { kind: "source-changed", task: { id, title: id }, path, commits: [], uncommitted: true, method: "file" };
}

describe("stopReason", () => {
  it("перечисляет задачи с уликой и отсылает к скиллу", () => {
    const candidates: Candidate[] = [
      changed("SPA-4", "src/upload/client.ts"),
      { kind: "source-missing", task: { id: "SPA-7", title: "x" }, path: "src/old.ts" },
      { kind: "source-missing", task: { id: "SPA-8", title: "x" }, path: "src/a.ts", renamedTo: "src/b.ts" },
    ];

    expect(stopReason("ru", "spa", candidates).text).toBe(
      "Беклог spa: после последней проверки менялся код задач — SPA-4 (изменён src/upload/client.ts); SPA-7 (нет файла src/old.ts); " +
        "SPA-8 (src/a.ts переименован в src/b.ts). Перепроверь их по скиллу backlog, раздел «Перепроверить задачи».",
    );
  });

  it("укладывается в лимит Claude Code и говорит, сколько задач не поместилось", () => {
    const candidates = Array.from({ length: 30 }, (_, index) => changed(`SPA-${index + 1}`, `src/features/module-${index}/very-long-file-name.ts`));

    const { text: reason, namedTaskIds } = stopReason("ru", "spa", candidates);

    expect(reason.length).toBeLessThanOrEqual(STOP_REASON_LIMIT);
    expect(reason).toMatch(/SPA-1 \(изменён .*; SPA-\d+ \(изменён [^)]+\) и ещё \d+\. Перепроверь/);
    const namedInText = reason.match(/SPA-\d+(?= \()/g) ?? [];
    expect(reason).toContain(`и ещё ${30 - namedInText.length}.`);
    expect(namedTaskIds).toEqual(namedInText);
  });

  it("задача со слишком длинной уликой не прячет короткие, а если не влезает ничего, названа хотя бы первая", () => {
    const huge = changed("SPA-1", `src/${"x".repeat(STOP_REASON_LIMIT)}.ts`);

    expect(stopReason("ru", "spa", [huge, changed("SPA-2", "src/a.ts")]).namedTaskIds).toEqual(["SPA-2"]);
    const alone = stopReason("ru", "spa", [huge]);
    expect(alone.namedTaskIds).toEqual(["SPA-1"]);
    expect(alone.text).toContain("— SPA-1. Перепроверь");
  });

  it("учёт затрат узнаёт по этой причине ход хука", () => {
    const feedback = `Stop hook feedback:\n${stopReason("ru", "spa", [changed("SPA-4", "src/upload/client.ts")]).text}`;

    const turns = attributeLine({ type: "user", isMeta: true, timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x/spa", message: { content: feedback } }, newTranscriptState());

    expect(turns).toEqual([expect.objectContaining({ kind: "hook", hookTurns: 1 })]);
  });
});
