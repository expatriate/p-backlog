import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TestMessagesProvider } from "../testing/messages-provider";
import { applyPanelStyles } from "../testing/side-panel";
import { SidePanel } from "./SidePanel";

function renderPanelBesideList(): HTMLElement {
  render(
    <TestMessagesProvider>
      <main>
        <a href="/t/SPA-1">Таймауты загрузки</a>
      </main>
      <SidePanel label="Задача SPA-1" heading={<h2>SPA-1</h2>} onClose={() => undefined}>
        <p>Описание</p>
      </SidePanel>
    </TestMessagesProvider>,
  );
  return screen.getByRole("main", { hidden: true });
}

describe("боковая панель по стилям из SidePanel.module.css", () => {
  it("в узком окне ложится поверх страницы: список под ней недоступен с клавиатуры", () => {
    applyPanelStyles("narrow");

    expect(renderPanelBesideList().hasAttribute("inert")).toBe(true);
  });

  it("в широком окне стоит рядом со списком, и список остаётся доступным", () => {
    applyPanelStyles("wide");

    expect(renderPanelBesideList().hasAttribute("inert")).toBe(false);
  });
});
