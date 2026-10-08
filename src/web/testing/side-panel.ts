import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, onTestFinished } from "vitest";
import { VIEWPORT_BREAKPOINTS } from "../styles/breakpoints";
import styles from "../ui/SidePanel.module.css";

const NARROW_WINDOW_QUERY = `@media (max-width: ${VIEWPORT_BREAKPOINTS.taskPanelOverlay}px)`;

export function applyPanelStyles(windowWidth: "narrow" | "wide"): void {
  const source = readFileSync(join(import.meta.dirname, "../ui/SidePanel.module.css"), "utf8");
  expect(source).toContain(NARROW_WINDOW_QUERY);
  const scoped = source.replace(/\.drawer(?![\w-])/g, `.${styles.drawer}`);
  // jsdom evaluates no media queries and applies only rules under @media screen.
  const sheet = document.head.appendChild(document.createElement("style"));
  sheet.textContent = scoped.replaceAll(NARROW_WINDOW_QUERY, windowWidth === "narrow" ? "@media screen" : "@media print");
  onTestFinished(() => sheet.remove());
}
