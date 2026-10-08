import { describe, expect, it } from "vitest";
import type { AccuracyPeriod, EffectTotals, FlowPeriod } from "../../core/api/contract";
import type { Language } from "../../core/i18n/language";
import { statsEn, statsRu } from "./messages";
import { codeAndTestsLines, linesAmount, summarizeAccuracy, summarizeIntake, summarizePending } from "./summaries";

const CATALOGS = { ru: statsRu, en: statsEn };

const digitsOf = (text: string): string => text.replace(/\D/g, "");

const flow = (...created: number[]): FlowPeriod[] => created.map((count, index) => ({ start: `2026-09-${10 + index}`, created: count, closed: 0, openAtEnd: 0 }));

const accuracy = (...rows: [decided: number, precision: number | null][]): AccuracyPeriod[] => rows.map(([decided, precision], index) => ({ start: `2026-09-${10 + index}`, decided, precision }));

const TOTALS: EffectTotals = {
  realLines: 1234,
  fixedTasks: 3,
  fixedLines: 1234.6,
  openTasks: 3,
  deferredTasks: 2,
  estimatedLines: 20.5,
  deferredLines: 1234.5,
  deferredTestLines: 300.4,
  noiseShare: 0.123,
};

const CASES: Record<string, (language: Language) => string> = {
  "среднее создание за период округляется до десятых": (language) => CATALOGS[language].intakeSummary(summarizeIntake("week", flow(1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1))),
  "среднее создание, вторая дробь": (language) => CATALOGS[language].intakeSummary(summarizeIntake("day", flow(2, 2, 1))),
  "ничего не создано": (language) => CATALOGS[language].intakeSummary(summarizeIntake("day", flow(0, 0, 0))),
  "точность последнего периода с решениями": (language) => CATALOGS[language].accuracySummary(summarizeAccuracy("week", accuracy([3, 0.8333], [2, null]))),
  "решённых кандидатов нет": (language) => CATALOGS[language].accuracySummary(summarizeAccuracy("day", accuracy([0, null]))),
  "строки: точные": (language) => CATALOGS[language].linesText(linesAmount(language, TOTALS.fixedLines)),
  "строки: оценка": (language) => CATALOGS[language].linesText(linesAmount(language, TOTALS.deferredLines, TOTALS.estimatedLines)),
  "код и тесты": (language) => CATALOGS[language].codeAndTests(codeAndTestsLines(language, TOTALS)),
  "исправлено сейчас": (language) => CATALOGS[language].fixedNow(TOTALS.fixedTasks, linesAmount(language, TOTALS.fixedLines)),
  "ожидающие с оценкой": (language) => CATALOGS[language].pendingEstimated(summarizePending(language, TOTALS.openTasks, 20.5)),
  мегабайты: (language) => CATALOGS[language].megabytes(12.345),
};

describe("числа в сообщениях статистики", () => {
  it.each(Object.entries(CASES))("%s — одинаковы в ru и en", (_name, render) => {
    expect(digitsOf(render("ru"))).toBe(digitsOf(render("en")));
  });
});
