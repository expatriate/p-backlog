import { describe, expect, it } from "vitest";
import { makeTask } from "../../core/model/testing/make-task";
import { epicTones, toneOf } from "./epic-tone";

const epic = (id: string, projectId = "spa") => makeTask({ id, projectId, type: "epic" });

describe("тоны эпиков", () => {
  it("раздаются по возрастанию номера внутри проекта", () => {
    const tones = epicTones([epic("SPA-10"), epic("SPA-2"), epic("TI-5", "ti"), makeTask({ id: "SPA-3" })]);

    expect([tones.get("SPA-2"), tones.get("SPA-10"), tones.get("TI-5")]).toEqual([1, 2, 1]);
    expect(tones.has("SPA-3")).toBe(false);
  });

  it("после пятого эпика тоны идут по кругу", () => {
    const tones = epicTones(["SPA-1", "SPA-2", "SPA-3", "SPA-4", "SPA-5", "SPA-6"].map((id) => epic(id)));

    expect(tones.get("SPA-5")).toBe(5);
    expect(tones.get("SPA-6")).toBe(1);
  });

  it("задача берёт тон своего эпика, без эпика или с ненайденным — без тона", () => {
    const tones = epicTones([epic("SPA-1")]);

    expect(toneOf(epic("SPA-1"), tones)).toBe(1);
    expect(toneOf(makeTask({ id: "SPA-2", epic: "SPA-1" }), tones)).toBe(1);
    expect(toneOf(makeTask({ id: "SPA-3" }), tones)).toBeUndefined();
    expect(toneOf(makeTask({ id: "SPA-4", epic: "SPA-99" }), tones)).toBeUndefined();
  });
});
