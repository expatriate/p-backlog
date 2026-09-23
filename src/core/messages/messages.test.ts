import { describe, expect, it } from "vitest";
import { parseTaskFile } from "../model/task-file";
import { coreMessages } from "./index";

const NBSP = " ";

describe("тексты ошибок ядра", () => {
  it("одна ошибка — фраза на каждом языке", () => {
    const cycle = { code: "blocker-cycle", cycle: ["SPA-1", "SPA-2", "SPA-1"] } as const;
    expect(coreMessages("ru").problem(cycle)).toBe("цикл блокеров: SPA-1 → SPA-2 → SPA-1");
    expect(coreMessages("en").problem(cycle)).toBe("blocker cycle: SPA-1 → SPA-2 → SPA-1");
  });

  it("ошибка zod из файла задачи не хранит значение, но называет его тип на каждом языке", () => {
    const parsed = parseTaskFile("---\nid: SPA-1\ntitle: X\ntags: секретное-значение\ncreated: 2026-09-17T10:00:00Z\n---\n", { projectId: "spa", path: "/backlog/spa/SPA-1.md", version: "v1" });
    const problems = parsed.ok ? [] : parsed.problems;
    expect(JSON.stringify(problems)).not.toContain("секретное-значение");
    expect(coreMessages("ru").problems(problems)).toBe("tags: Неверный ввод: ожидалось массив, получено string");
    expect(coreMessages("en").problems(problems)).toBe("tags: Invalid input: expected array, received string");
  });
});

describe("прогноз долга", () => {
  const forecast = { closed: 0, created: 0, open: 3, weeklyNet: 0, weeks: null, until: null, windowWeeks: 4 };

  it("нет открытых задач", () => {
    expect(coreMessages("ru").forecast({ ...forecast, open: 0 })).toBe("Открытых задач нет");
    expect(coreMessages("en").forecast({ ...forecast, open: 0 })).toBe("No open tasks");
  });

  it("долг разберётся к дате", () => {
    const until = new Date(2026, 9, 9, 12).toISOString();
    expect(coreMessages("ru").forecast({ ...forecast, weeklyNet: 1, weeks: 3, until })).toBe(`Долг разберётся примерно за 3${NBSP}нед. (к 09.10)`);
  });

  it("долг не уменьшается", () => {
    expect(coreMessages("ru").forecast(forecast)).toBe("Долг не уменьшается");
    expect(coreMessages("en").forecast(forecast)).toBe("Debt is not shrinking");
  });

  it("долг растёт — склонение по числу и языку", () => {
    expect(coreMessages("ru").forecast({ ...forecast, weeklyNet: -0.75 })).toBe(`Долг растёт на 0,8${NBSP}задачи в неделю`);
    expect(coreMessages("en").forecast({ ...forecast, weeklyNet: -0.75 })).toBe("Debt grows by 0.8 tasks a week");
    expect(coreMessages("ru").forecast({ ...forecast, weeklyNet: -0.96 })).toBe(`Долг растёт на 1${NBSP}задача в неделю`);
    expect(coreMessages("en").forecast({ ...forecast, weeklyNet: -0.96 })).toBe("Debt grows by 1 task a week");
    expect(coreMessages("ru").forecast({ ...forecast, weeklyNet: -2 })).toBe(`Долг растёт на 2${NBSP}задачи в неделю`);
    expect(coreMessages("ru").forecast({ ...forecast, weeklyNet: -1 })).toBe(`Долг растёт на 1${NBSP}задача в неделю`);
  });

  it("хвост прогноза — недели согласуются с числом", () => {
    expect(coreMessages("ru").forecastTail({ ...forecast, closed: 2, created: 20, windowWeeks: 4 })).toBe(`за 4${NBSP}недели: закрыто 2, создано 20`);
    expect(coreMessages("ru").forecastTail({ ...forecast, closed: 0, created: 1, windowWeeks: 1 })).toBe(`за 1${NBSP}неделю: закрыто 0, создано 1`);
  });
});

describe("тревоги", () => {
  it("долг растёт — текст на русском", () => {
    expect(coreMessages("ru").signal({ kind: "debt-growing", params: { weeks: 3, created: 3, closed: 0 } })).toBe(`Долг растёт 3${NBSP}недели подряд: создано 3, закрыто 0`);
  });

  it("шумная проверка называет улику и способ", () => {
    expect(
      coreMessages("ru").signal({ kind: "noisy-check", params: { evidence: "source-changed", method: "file", percent: 10, decided: 10, windowDays: 14 } }),
    ).toBe(`Проверка «код изменился» по файлу почти всегда ошибается: точность 10% на 10 решённых за 14${NBSP}дней`);
  });
});

describe("подписи улик, способов и графа", () => {
  it("совпадение дубля и состояние графа на каждом языке", () => {
    expect(coreMessages("ru").duplicateMatchLabel("source")).toBe("по месту в коде");
    expect(coreMessages("en").duplicateMatchLabel("source")).toBe("by code location");
    expect(coreMessages("ru").graphStateLabel("stale")).toBe("устарел");
    expect(coreMessages("en").graphStateLabel("stale")).toBe("stale");
  });
});

describe("счёт по единицам", () => {
  it("число, форма и язык", () => {
    expect(coreMessages("ru").count(3, "task")).toBe(`3${NBSP}задачи`);
    expect(coreMessages("en").count(3, "task")).toBe(`3${NBSP}tasks`);
    expect(coreMessages("en").count(1, "day")).toBe(`1${NBSP}day`);
  });
});

describe("сроки в днях", () => {
  it("медиана и 90-й процентиль: нет данных, меньше дня, округление на каждом языке", () => {
    expect(coreMessages("ru").days(null)).toBe("—");
    expect(coreMessages("ru").days(0.4)).toBe("меньше дня");
    expect(coreMessages("ru").days(2.6)).toBe(`3${NBSP}дн.`);
    expect(coreMessages("ru").p90(0.5)).toBe("быстрее суток");
    expect(coreMessages("ru").p90(2.6)).toBe(`за 3${NBSP}дн.`);
    expect(coreMessages("en").days(1.2)).toBe(`1${NBSP}day`);
    expect(coreMessages("en").p90(0.5)).toBe("within a day");
    expect(coreMessages("en").p90(2.6)).toBe(`within 3${NBSP}days`);
  });
});
