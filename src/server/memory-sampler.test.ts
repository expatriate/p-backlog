import { describe, expect, it } from "vitest";
import { createMemorySampler } from "./memory-sampler";

describe("createMemorySampler", () => {
  it("кольцевой буфер хранит не больше capacity последних точек", () => {
    const times = ["2026-09-18T09:00:00+03:00", "2026-09-18T09:00:05+03:00", "2026-09-18T09:00:10+03:00", "2026-09-18T09:00:15+03:00", "2026-09-18T09:00:20+03:00"];
    let index = 0;
    const sampler = createMemorySampler({ capacity: 3, now: () => new Date(times[index++] ?? times[times.length - 1] ?? "") });

    for (let i = 0; i < times.length; i++) sampler.sample();

    expect(sampler.samples().map((point) => point.at)).toEqual(times.slice(-3));
  });

  it("точка содержит время и память процесса в мегабайтах", () => {
    const sampler = createMemorySampler({ now: () => new Date("2026-09-18T09:00:00+03:00") });

    sampler.sample();

    expect(sampler.samples()).toEqual([{ at: "2026-09-18T09:00:00+03:00", rssMb: expect.any(Number), heapUsedMb: expect.any(Number) }]);
    expect(sampler.samples()[0]?.rssMb).toBeGreaterThan(0);
  });
});
