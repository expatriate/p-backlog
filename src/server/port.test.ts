import { describe, expect, it } from "vitest";
import { serverRu } from "./messages.ru";
import { listenFailure, readPort, requestedPort } from "./port";

describe("порт сервера", () => {
  it("берёт число из переменной, иначе значение по умолчанию", () => {
    expect(readPort("5000")).toBe(5000);
    expect(readPort("ерунда")).toBe(4317);
    expect(readPort(undefined)).toBe(4317);
    expect([requestedPort("0x10"), requestedPort("1e3"), requestedPort(" 80 "), requestedPort("80.0")]).toEqual([null, null, null, null]);
  });

  it("занятый порт объясняется словами, прочие ошибки — своим текстом", () => {
    const busy: NodeJS.ErrnoException = Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });

    expect(listenFailure(busy, 4317, serverRu)).toBe("p-backlog не запустился: порт 4317 уже занят");
    expect(listenFailure(new Error("нет прав"), 4317, serverRu)).toBe("p-backlog не запустился: нет прав");
  });
});
