import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { TagCell } from "./TagCell";

const CHIP_WIDTHS: Record<string, number> = { "#dev-env": 72, "#mock-backend": 110, "#upload": 64, "+3": 31 };

function visibleChips(): string[] {
  return screen.queryAllByText(/^[#+]/, { ignore: '[aria-hidden="true"] *' }).map((chip) => chip.textContent ?? "");
}

function stubLayout(cellWidth: number) {
  const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return { width: CHIP_WIDTHS[this.textContent ?? ""] ?? 0 } as DOMRect;
  });
  const width = vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(cellWidth);
  onTestFinished(() => {
    rect.mockRestore();
    width.mockRestore();
  });
  return width;
}

describe("ячейка тегов", () => {
  it("показывает теги, которые влезают целиком, остальные — в «+N» с подсказкой", () => {
    stubLayout(200);

    render(<TagCell tags={["dev-env", "mock-backend", "upload"]} />);

    expect(visibleChips()).toEqual(["#dev-env", "+2"]);
    expect(screen.getByText("+2").getAttribute("title")).toBe("dev-env, mock-backend, upload");
  });

  it("если всё влезает, «+N» нет", () => {
    render(<TagCell tags={["upload"]} />);

    expect(visibleChips()).toEqual(["#upload"]);
  });

  it("ячейка, появившаяся после сужения окна, пересчитывает теги", () => {
    const width = stubLayout(0);
    const originalResizeObserver = globalThis.ResizeObserver;
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    onTestFinished(() => {
      vi.stubGlobal("ResizeObserver", originalResizeObserver);
    });

    render(<TagCell tags={["dev-env", "mock-backend", "upload"]} />);

    expect(visibleChips()).toEqual(["+3"]);

    width.mockReturnValue(200);
    act(() => {
      callbacks.forEach((callback) => callback([], {} as ResizeObserver));
    });

    expect(visibleChips()).toEqual(["#dev-env", "+2"]);
  });

  it("без тегов ячейка пустая, без линейки для измерения", () => {
    const { container } = render(<TagCell tags={[]} />);

    expect(visibleChips()).toEqual([]);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
