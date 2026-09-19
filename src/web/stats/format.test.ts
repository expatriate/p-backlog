import { describe, expect, it } from "vitest";
import { forecastText, formatDays, formatShare, formatSigned, formatStay } from "./format";

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

describe("тексты потока", () => {
  const forecast = { closed: 0, created: 0, open: 3, weeklyNet: 0, weeks: null, until: null };

  it("прогноз по чистому темпу", () => {
    expect(forecastText({ ...forecast, open: 0 })).toBe("Открытых задач нет");
    expect(forecastText({ ...forecast, weeklyNet: 1, weeks: 3, until: new Date(2026, 9, 9, 12).toISOString() })).toBe("Долг разберётся примерно за 3 нед. (к 09.10)");
    expect(forecastText(forecast)).toBe("Долг не уменьшается");
    expect(forecastText({ ...forecast, weeklyNet: -0.75 })).toBe("Долг растёт на 0,8 задач в неделю");
    expect(forecastText({ ...forecast, weeklyNet: -2 })).toBe("Долг растёт на 2 задач в неделю");
  });

  it("время в статусе: «не меньше» только от суток", () => {
    expect(formatStay(3.2, true)).toBe("не меньше 3 дн.");
    expect(formatStay(0.5, true)).toBe("меньше дня");
    expect(formatStay(3.2, false)).toBe("3 дн.");
  });
});
