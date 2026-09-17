import { describe, expect, it } from "vitest";
import { checklistItems } from "./checklist";

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
