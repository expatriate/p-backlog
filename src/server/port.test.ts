import { describe, expect, it } from "vitest";
import { serverRu } from "./messages.ru";
import { listenFailure } from "./port";

describe("порт сервера", () => {
  it("занятый порт объясняется словами, прочие ошибки — своим текстом", () => {
    const busy: NodeJS.ErrnoException = Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });

    expect(listenFailure(busy, 4317, serverRu)).toBe("p-backlog не запустился: порт 4317 уже занят");
    expect(listenFailure(new Error("нет прав"), 4317, serverRu)).toBe("p-backlog не запустился: нет прав");
  });
});
