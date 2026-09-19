import { describe, expect, it } from "vitest";
import { forecastTail, forecastText, formatDays, formatDecimal, formatP90, formatShare, formatSigned, NBSP, plural } from "./format";

describe("формат статистики", () => {
  it("дни: нет данных, меньше дня, округление", () => {
    expect(formatDays(null)).toBe("—");
    expect(formatDays(0.4)).toBe("меньше дня");
    expect(formatDays(2.6)).toBe(`3${NBSP}дн.`);
  });

  it("склонение по числу: 1 — one, 2–4 — few, 5–20 и дробные — many", () => {
    expect(plural(1, "задача", "задачи", "задач")).toBe("задача");
    expect(plural(2, "задача", "задачи", "задач")).toBe("задачи");
    expect(plural(4, "задача", "задачи", "задач")).toBe("задачи");
    expect(plural(5, "задача", "задачи", "задач")).toBe("задач");
    expect(plural(11, "задача", "задачи", "задач")).toBe("задач");
    expect(plural(21, "задача", "задачи", "задач")).toBe("задача");
    expect(plural(0.8, "задача", "задачи", "задач")).toBe("задач");
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
});

describe("тексты потока", () => {
  const forecast = { closed: 0, created: 0, open: 3, weeklyNet: 0, weeks: null, until: null, windowWeeks: 4 };

  it("прогноз по чистому темпу", () => {
    expect(forecastText({ ...forecast, open: 0 })).toBe("Открытых задач нет");
    expect(forecastText({ ...forecast, weeklyNet: 1, weeks: 3, until: new Date(2026, 9, 9, 12).toISOString() })).toBe(`Долг разберётся примерно за 3${NBSP}нед. (к 09.10)`);
    expect(forecastText(forecast)).toBe("Долг не уменьшается");
    expect(forecastText({ ...forecast, weeklyNet: -0.75 })).toBe(`Долг растёт на 0,8${NBSP}задач в неделю`);
    expect(forecastText({ ...forecast, weeklyNet: -2 })).toBe(`Долг растёт на 2${NBSP}задачи в неделю`);
    expect(forecastText({ ...forecast, weeklyNet: -1 })).toBe(`Долг растёт на 1${NBSP}задача в неделю`);
  });

  it("хвост прогноза — один текст для CLI и веба, недели согласуются с числом", () => {
    expect(forecastTail({ ...forecast, closed: 2, created: 20, windowWeeks: 4 })).toBe(`за 4${NBSP}недели: закрыто 2, создано 20`);
    expect(forecastTail({ ...forecast, closed: 0, created: 1, windowWeeks: 1 })).toBe(`за 1${NBSP}неделю: закрыто 0, создано 1`);
  });
});
