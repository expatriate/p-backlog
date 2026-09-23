import { describe, expect, it } from "vitest";
import { formatShare, formatSigned } from "./format";

describe("формат статистики", () => {
  it("доли в процентах и знак у прироста", () => {
    expect(formatShare(null)).toBe("—");
    expect(formatShare(0.2)).toBe("20%");
    expect(formatSigned(5)).toBe("+5");
    expect(formatSigned(-3)).toBe("-3");
    expect(formatSigned(0)).toBe("0");
  });
});
