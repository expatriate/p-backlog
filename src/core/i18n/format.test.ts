import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatDayMonth, formatDecimal, formatMoney, formatNumber } from "./format";

describe("форматирование по языку", () => {
  it("день и месяц: русский порядок дд.мм, английский мм/дд", () => {
    const date = new Date("2026-09-05T10:00:00Z");
    expect(formatDayMonth("ru", date)).toBe("05.09");
    expect(formatDayMonth("en", date)).toBe("09/05");
  });

  it("дата с годом следует тому же порядку", () => {
    expect(formatDate("ru", "2026-09-05T10:00:00Z")).toBe("05.09.26");
    expect(formatDate("en", "2026-09-05T10:00:00Z")).toBe("09/05/26");
  });

  it("дата со временем: русский 24-часовой формат, английский — с AM/PM", () => {
    const iso = "2026-09-05T10:00:00Z";
    expect(formatDateTime("ru", iso)).toMatch(/^05\.09\.2026, \d{2}:\d{2}$/);
    expect(formatDateTime("en", iso)).toMatch(/^09\/05\/2026, \d{1,2}:\d{2}\s?(AM|PM)$/);
  });

  it("число: русский разделитель тысяч — неразрывный пробел и запятая, английский — запятая и точка", () => {
    expect(formatNumber("ru", 1234.5)).toBe("1 234,5");
    expect(formatNumber("en", 1234.5)).toBe("1,234.5");
  });

  it("число с одним знаком после запятой без «,0»: русская запятая, английская точка", () => {
    expect(formatDecimal("ru", 2.44)).toBe("2,4");
    expect(formatDecimal("ru", 4)).toBe("4");
    expect(formatDecimal("en", 2.44)).toBe("2.4");
  });

  it("деньги: разделитель разрядов, две цифры после запятой, null — «—»", () => {
    expect(formatMoney("ru", 1234.56)).toBe("$1 234,56");
    expect(formatMoney("ru", 0)).toBe("$0,00");
    expect(formatMoney("en", 1234.56)).toBe("$1,234.56");
    expect(formatMoney("en", null)).toBe("—");
  });
});
