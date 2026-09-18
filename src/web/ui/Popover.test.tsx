import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { Popover, POPOVER_INITIAL_FOCUS } from "./Popover";

function stubViewport(clientWidth: number): void {
  const clientWidthSpy = vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
  document.documentElement.style.setProperty("--space-4", "16px");
  onTestFinished(() => {
    clientWidthSpy.mockRestore();
    document.documentElement.style.removeProperty("--space-4");
  });
}

function stubMenuRect(rect: { left: number; right: number; width: number }): void {
  const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
  onTestFinished(() => rectSpy.mockRestore());
}

describe("Popover", () => {
  it("меню, не влезающее справа, сдвигается влево в пределах экрана", async () => {
    stubViewport(320);
    stubMenuRect({ left: 150, right: 438, width: 288 });
    const user = userEvent.setup();
    render(
      <Popover trigger="Меню">
        <p>содержимое</p>
      </Popover>,
    );

    await user.click(screen.getByRole("button", { name: "Меню" }));

    const menu = screen.getByText("содержимое").parentElement as HTMLElement;
    expect(menu.style.transform).toBe("translateX(-134px)");
  });

  it("меню, которое помещается, не сдвигается", async () => {
    stubViewport(320);
    stubMenuRect({ left: 12, right: 300, width: 288 });
    const user = userEvent.setup();
    render(
      <Popover trigger="Меню">
        <p>содержимое</p>
      </Popover>,
    );

    await user.click(screen.getByRole("button", { name: "Меню" }));

    const menu = screen.getByText("содержимое").parentElement as HTMLElement;
    expect(menu.style.transform).toBe("");
  });

  it("меню ставит начальный фокус без прокрутки страницы", async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    onTestFinished(() => focusSpy.mockRestore());
    const user = userEvent.setup();
    render(
      <Popover trigger="Меню">
        <input aria-label="Поле" {...POPOVER_INITIAL_FOCUS} />
      </Popover>,
    );

    await user.click(screen.getByRole("button", { name: "Меню" }));

    const field = screen.getByRole("textbox", { name: "Поле" });
    expect(document.activeElement).toBe(field);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });
});
