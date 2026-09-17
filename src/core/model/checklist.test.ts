import { describe, expect, it } from "vitest";
import { checklistItems, toggleChecklistItem } from "./checklist";

const BODY = [
  "Описание",
  "- [ ] первый",
  "  * [x] второй",
  "```md",
  "- [ ] в примере кода",
  "```",
  "+ [X] третий",
  "- [] не пункт",
].join("\n");

describe("checklistItems", () => {
  it("находит пункты вне блоков кода", () => {
    expect(checklistItems(BODY)).toEqual([
      { line: 1, checked: false, text: "первый" },
      { line: 2, checked: true, text: "второй" },
      { line: 6, checked: true, text: "третий" },
    ]);
  });

  it("не считает пунктами строки внутри ~~~ блока", () => {
    expect(checklistItems("~~~\n- [ ] x\n~~~\n- [ ] y")).toEqual([{ line: 3, checked: false, text: "y" }]);
  });
});

describe("toggleChecklistItem", () => {
  it("переключает пункт по номеру строки и не трогает остальное", () => {
    const toggled = toggleChecklistItem(BODY, 1);
    expect(toggled.split("\n")[1]).toBe("- [x] первый");
    expect(toggleChecklistItem(toggled, 1)).toBe(BODY);
    expect(toggleChecklistItem(BODY, 6).split("\n")[6]).toBe("+ [ ] третий");
  });

  it("не меняет тело для строки, которая не пункт чеклиста или лежит в блоке кода", () => {
    expect(toggleChecklistItem(BODY, 0)).toBe(BODY);
    expect(toggleChecklistItem(BODY, 4)).toBe(BODY);
    expect(toggleChecklistItem(BODY, 99)).toBe(BODY);
  });
});
