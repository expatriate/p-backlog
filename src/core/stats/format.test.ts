import { describe, expect, it } from "vitest";
import { formatDays, formatDecimal, formatMoney, formatP90, formatShare, formatSigned, NBSP } from "./format";

describe("формат статистики", () => {
  it("дни: нет данных, меньше дня, округление", () => {
    expect(formatDays(null)).toBe("—");
    expect(formatDays(0.4)).toBe("меньше дня");
    expect(formatDays(2.6)).toBe(`3${NBSP}дн.`);
  });

  it("90-й процентиль: меньше суток — «быстрее суток», иначе «за N дн.»", () => {
    expect(formatP90(null)).toBe("—");
    expect(formatP90(0.5)).toBe("быстрее суток");
    expect(formatP90(2.6)).toBe(`за 3${NBSP}дн.`);
  });

  it("доли в процентах и знак у прироста", () => {
    expect(formatShare(null)).toBe("—");
    expect(formatShare(0.2)).toBe("20%");
    expect(formatSigned(5)).toBe("+5");
    expect(formatSigned(-3)).toBe("-3");
    expect(formatSigned(0)).toBe("0");
  });

  it("число с одним знаком после запятой без «,0»", () => {
    expect(formatDecimal(2.44)).toBe("2,4");
    expect(formatDecimal(4)).toBe("4");
  });

  it("деньги: разделитель разрядов, две цифры после запятой, null — «—»", () => {
    expect(formatMoney(1234.56)).toBe(`$1${NBSP}234,56`);
    expect(formatMoney(0)).toBe("$0,00");
    expect(formatMoney(null)).toBe("—");
  });
});
