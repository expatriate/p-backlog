import { describe, expect, it } from "vitest";
import { NBSP } from "../../core/i18n/plural";
import { formatFormulaShare } from "./effect-format";

describe("итог формулы шума", () => {
  it("без оценки ожидающих — знак равенства", () => {
    expect(formatFormulaShare(0.22, null)).toBe(`=${NBSP}22%`);
  });

  it("с оценкой ожидающих — приблизительно", () => {
    expect(formatFormulaShare(0.22, 40)).toBe(`≈${NBSP}22%`);
  });
});
