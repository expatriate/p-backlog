import { describe, expect, it } from "vitest";
import { envPortOrDefault } from "./server-address";

describe("порт сервера", () => {
  it("берёт число из переменной, без значения — порт по умолчанию, иное не принимает", () => {
    expect(envPortOrDefault("5000")).toBe(5000);
    expect(envPortOrDefault("ерунда")).toBeNull();
    expect(envPortOrDefault(undefined)).toBe(4317);
    expect(envPortOrDefault("")).toBe(4317);
    expect([envPortOrDefault("0x10"), envPortOrDefault("1e3"), envPortOrDefault(" 80 "), envPortOrDefault("80.0")]).toEqual([null, null, null, null]);
  });
});
