import { describe, expect, it } from "vitest";
import { epicEta, formatStay } from "./format";
import { NBSP } from "../../core/stats/format";

describe("тексты потока", () => {
  it("время в статусе: «не меньше» только от суток", () => {
    expect(formatStay(3.2, true)).toBe(`не меньше 3${NBSP}дн.`);
    expect(formatStay(0.5, true)).toBe("меньше дня");
    expect(formatStay(3.2, false)).toBe(`3${NBSP}дн.`);
  });

  it("срок эпика", () => {
    expect(epicEta(3)).toBe(`≈${NBSP}3${NBSP}нед.`);
    expect(epicEta(0)).toBe("готов");
    expect(epicEta(null)).toBe("темпа нет");
  });
});
