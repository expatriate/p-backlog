import { describe, expect, it } from "vitest";
import { formatLocalIso } from "./dates";

describe("formatLocalIso", () => {
  it("пишет локальное время с поясом и обозначает тот же момент", () => {
    const moment = new Date("2026-09-17T14:50:07Z");
    const formatted = formatLocalIso(moment);
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(Date.parse(formatted)).toBe(moment.getTime());
  });
});
