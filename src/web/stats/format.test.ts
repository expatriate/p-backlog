import { describe, expect, it } from "vitest";
import { formatDays, formatShare, formatSigned } from "./format";

describe("формат статистики", () => {
  it("дни: нет данных, меньше дня, округление", () => {
    expect(formatDays(null)).toBe("—");
    expect(formatDays(0.4)).toBe("меньше дня");
    expect(formatDays(2.6)).toBe("3 дн.");
  });

  it("доли в процентах и знак у прироста", () => {
    expect(formatShare(null)).toBe("—");
    expect(formatShare(0.2)).toBe("20%");
    expect(formatSigned(5)).toBe("+5");
    expect(formatSigned(-3)).toBe("-3");
    expect(formatSigned(0)).toBe("0");
  });
});
