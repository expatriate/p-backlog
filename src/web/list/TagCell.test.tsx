import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

    render(<TagCell tags={["dev-env", "mock-backend", "upload"]} selected={[]} onToggle={() => undefined} />);

    expect(visibleChips()).toEqual(["#dev-env", "+2"]);
    expect(screen.getByText("+2").getAttribute("title")).toBe("dev-env, mock-backend, upload");
  });

  it("если всё влезает, «+N» нет", () => {
    render(<TagCell tags={["upload"]} selected={[]} onToggle={() => undefined} />);

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

    render(<TagCell tags={["dev-env", "mock-backend", "upload"]} selected={[]} onToggle={() => undefined} />);

    expect(visibleChips()).toEqual(["+3"]);

    width.mockReturnValue(200);
    act(() => {
      callbacks.forEach((callback) => callback([], {} as ResizeObserver));
    });

    expect(visibleChips()).toEqual(["#dev-env", "+2"]);
  });

  it("без тегов ячейка пустая, без линейки для измерения", () => {
    const { container } = render(<TagCell tags={[]} selected={[]} onToggle={() => undefined} />);

    expect(visibleChips()).toEqual([]);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("клик по тегу переключает фильтр, выбранный тег нажат", async () => {
    const toggled: string[] = [];
    render(<TagCell tags={["upload"]} selected={["upload"]} onToggle={(tag) => toggled.push(tag)} />);

    const chip = screen.getByRole("button", { name: "#upload" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(chip);

    expect(toggled).toEqual(["upload"]);
  });

  it("«+N» раскрывает спрятанные теги, «свернуть» возвращает обратно", async () => {
    stubLayout(200);
    render(<TagCell tags={["dev-env", "mock-backend", "upload"]} selected={[]} onToggle={() => undefined} />);
    expect(visibleChips()).toEqual(["#dev-env", "+2"]);

    await userEvent.click(screen.getByRole("button", { name: "Показать ещё 2" }));

    expect(visibleChips()).toEqual(["#dev-env", "#mock-backend", "#upload"]);

    await userEvent.click(screen.getByRole("button", { name: "свернуть" }));

    expect(visibleChips()).toEqual(["#dev-env", "+2"]);
  });
});
