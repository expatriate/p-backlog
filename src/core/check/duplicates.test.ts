import { describe, expect, it } from "vitest";
import { makeTask } from "../model/testing/make-task";
import type { Task } from "../model/types";
import { duplicateCandidates } from "./duplicates";

const CREATED = "2026-09-11T10:00:00+03:00";

describe("duplicateCandidates", () => {
  const upload = makeTask({ id: "SPA-1", title: "Таймаут загрузки не учитывает размер файла", created: CREATED });

  it("похожие заголовки и одно место в source; кандидат — более новая задача", () => {
    const sameTitle = makeTask({ id: "SPA-2", title: "Загрузка: таймаут не учитывает большие файлы", created: CREATED });
    const samePlaceA = makeTask({ id: "SPA-3", title: "Очередь", source: "src/queue.ts:40", created: CREATED });
    const samePlaceB = makeTask({ id: "SPA-4", title: "Повтор", source: "src/queue.ts:40", created: CREATED });

    expect(duplicateCandidates([upload, sameTitle, samePlaceA, samePlaceB])).toEqual([
      { kind: "duplicate", task: { id: "SPA-2", title: sameTitle.title }, other: { id: "SPA-1", title: upload.title }, match: "title" },
      { kind: "duplicate", task: { id: "SPA-4", title: "Повтор" }, other: { id: "SPA-3", title: "Очередь" }, match: "source" },
    ]);
  });

  it("две задачи в одном символе — дубль, даже когда строки разные", () => {
    const first = makeTask({ id: "SPA-3", title: "Очередь висит", source: "src/queue.ts:12", created: CREATED });
    const second = makeTask({ id: "SPA-4", title: "Повторная отправка", source: "src/queue.ts:20", created: CREATED });
    const symbolOf = (task: Task) => (task.source?.startsWith("src/queue.ts") === true ? "src/queue.ts::drainQueue" : null);

    expect(duplicateCandidates([first, second], symbolOf)).toEqual([
      { kind: "duplicate", task: { id: "SPA-4", title: "Повторная отправка" }, other: { id: "SPA-3", title: "Очередь висит" }, match: "symbol" },
    ]);
  });

  it("задачи в разных символах дублями не считаются", () => {
    const first = makeTask({ id: "SPA-3", title: "Очередь висит", source: "src/queue.ts:12", created: CREATED });
    const second = makeTask({ id: "SPA-4", title: "Повторная отправка", source: "src/queue.ts:80", created: CREATED });
    const symbolOf = (task: Task) => (task.source === "src/queue.ts:12" ? "src/queue.ts::drainQueue" : "src/queue.ts::retry");

    expect(duplicateCandidates([first, second], symbolOf)).toEqual([]);
  });

  it("одно место в source сравнивается по нормализованному пути и той же строке", () => {
    const dotted = makeTask({ id: "SPA-3", title: "Очередь", source: "./src/queue.ts:40", created: CREATED });
    const plain = makeTask({ id: "SPA-4", title: "Повтор", source: "src/queue.ts:40", created: CREATED });
    const otherLine = makeTask({ id: "SPA-5", title: "Кэш", source: "src/queue.ts:41", created: CREATED });

    expect(duplicateCandidates([dotted, plain, otherLine])).toEqual([
      { kind: "duplicate", task: { id: "SPA-4", title: "Повтор" }, other: { id: "SPA-3", title: "Очередь" }, match: "source" },
    ]);
  });

  it("тот же файл, но другая строка — не дубль: в большом файле много разных проблем", () => {
    const first = makeTask({ id: "SPA-3", title: "Очередь", source: "src/queue.ts:1", created: CREATED });
    const second = makeTask({ id: "SPA-4", title: "Повтор", source: "src/queue.ts:40", created: CREATED });
    expect(duplicateCandidates([first, second])).toEqual([]);
  });

  it("связанные через related и подтверждённые обе после создания пары не предлагаются", () => {
    const linked = makeTask({ id: "SPA-2", title: "Загрузка: таймаут не учитывает большие файлы", related: ["SPA-1"], created: CREATED });
    expect(duplicateCandidates([upload, linked])).toEqual([]);

    const later = "2026-09-12T10:00:00+03:00";
    const confirmedA = { ...upload, verified: later };
    const confirmedB = makeTask({ id: "SPA-2", title: "Загрузка: таймаут не учитывает большие файлы", created: CREATED, verified: later });
    expect(duplicateCandidates([confirmedA, confirmedB])).toEqual([]);
    expect(duplicateCandidates([upload, confirmedB])).toHaveLength(1);
  });
});
