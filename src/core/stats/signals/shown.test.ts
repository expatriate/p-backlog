import { describe, expect, it } from "vitest";
import { markShown, signalsToShow } from "./shown";

const debt = { kind: "debt-growing" as const, text: "Долг растёт" };
const urgent = { kind: "urgent-stale" as const, text: "Срочные" };

describe("показ тревог раз в день", () => {
  it("показываются только виды, не показанные сегодня; отметка ставит сегодняшнюю дату", () => {
    const shown = { "debt-growing": "2026-09-18", "urgent-stale": "2026-09-17" };

    expect(signalsToShow([debt, urgent], shown, "2026-09-18")).toEqual([urgent]);
    expect(markShown(shown, [urgent], "2026-09-18")).toEqual({ "debt-growing": "2026-09-18", "urgent-stale": "2026-09-18" });
  });
});
