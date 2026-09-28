import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { TestMessagesProvider } from "../testing/messages-provider";
import { SidePanel } from "./SidePanel";
import styles from "./SidePanel.module.css";

const NARROW_WINDOW_QUERY = "@media (max-width: 1160px)";

function applyPanelStyles(windowIsNarrow: boolean): void {
  const source = readFileSync(join(import.meta.dirname, "SidePanel.module.css"), "utf8");
  expect(source).toContain(NARROW_WINDOW_QUERY);
  const scoped = source.replace(/\.drawer(?![\w-])/g, `.${styles.drawer}`);
  // jsdom evaluates no media queries and applies only rules under @media screen.
  const sheet = document.head.appendChild(document.createElement("style"));
  sheet.textContent = scoped.replaceAll(NARROW_WINDOW_QUERY, windowIsNarrow ? "@media screen" : "@media print");
  onTestFinished(() => sheet.remove());
}

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
    applyPanelStyles(true);

    expect(renderPanelBesideList().hasAttribute("inert")).toBe(true);
  });

  it("в широком окне стоит рядом со списком, и список остаётся доступным", () => {
    applyPanelStyles(false);

    expect(renderPanelBesideList().hasAttribute("inert")).toBe(false);
  });
});
