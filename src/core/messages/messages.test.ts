import { describe, expect, it } from "vitest";
import { parseTaskFile } from "../model/task-file";
import { coreMessages } from "./index";

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
