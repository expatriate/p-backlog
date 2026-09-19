import { describe, expect, it } from "vitest";
import { listenFailure, readPort } from "./port";

describe("порт сервера", () => {
  it("берёт число из переменной, иначе значение по умолчанию", () => {
    expect(readPort("5000")).toBe(5000);
    expect(readPort("ерунда")).toBe(4317);
    expect(readPort(undefined)).toBe(4317);
  });

  it("занятый порт объясняется словами, прочие ошибки — своим текстом", () => {
    const busy: NodeJS.ErrnoException = Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });

    expect(listenFailure(busy, 4317)).toBe("p-backlog не запустился: порт 4317 уже занят");
    expect(listenFailure(new Error("нет прав"), 4317)).toBe("p-backlog не запустился: нет прав");
  });
});
