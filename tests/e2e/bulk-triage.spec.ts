import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";
import { collectCspViolations } from "./csp-violations";

const TASK_COUNT = 30;
const projectDir = join(E2E_BACKLOG_DIR, "triage");
const taskFile = (n: number) => join(projectDir, `TRI-${n}.md`);

async function writeBacklog(): Promise<void> {
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "project.md"), "---\nname: triage\nprefix: TRI\nrepos: []\n---\n", "utf8");
  for (let n = 1; n <= TASK_COUNT; n++) {
    await writeFile(taskFile(n), `---\nid: TRI-${n}\ntitle: Разбор ${n}\ncreated: 2026-09-17T10:00:00+03:00\n---\n\nОписание.\n`, "utf8");
  }
}

async function closureOnDisk(n: number): Promise<string> {
  const file = await readFile(taskFile(n), "utf8");
  return ["status", "resolution"].map((field) => new RegExp(`^${field}: (.+)$`, "m").exec(file)?.[1] ?? "-").join(" ");
}

async function select(page: Page, ...numbers: number[]): Promise<void> {
  for (const n of numbers) await page.getByRole("checkbox", { name: `Выбрать TRI-${n}`, exact: true }).check();
}

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.beforeEach(writeBacklog);

test("три задачи закрываются с причиной и возвращаются кнопкой «Отменить»", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await page.goto("/p/triage");
  await select(page, 1, 2, 3);

  await page.getByRole("button", { name: "Закрыть как неактуальные" }).click();
  await page.getByRole("textbox", { name: "Причина" }).fill("дубли разбора");
  await page.getByRole("button", { name: "Закрыть 3" }).click();

  const undo = page.getByRole("status").getByRole("button", { name: "Отменить" });
  await expect(page.getByRole("status").filter({ hasText: "Закрыто 3 из 3" })).toBeVisible();
  await expect(undo).toBeFocused();
  await expect(page.getByRole("link", { name: "Разбор 1", exact: true })).toBeHidden();
  expect(await Promise.all([1, 2, 3].map(closureOnDisk))).toEqual(Array(3).fill("cancelled obsolete"));

  await page.keyboard.press("Enter");

  await expect(page.getByRole("status").filter({ hasText: "Возвращено 3 из 3" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Разбор 1", exact: true })).toBeVisible();
  expect(await Promise.all([1, 2, 3].map(closureOnDisk))).toEqual(Array(3).fill("backlog -"));
  expect(await violations.settled()).toEqual([]);
});

test("на 320 px панель и уведомление не дают горизонтальной прокрутки и не закрывают фокус", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/p/triage");
  await select(page, 1);
  const panel = page.getByRole("region", { name: "Действия с выбранными" });
  await expect(panel).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);

  await page.getByRole("checkbox", { name: "Выбрать TRI-1", exact: true }).focus();
  const checked: string[] = [];
  const obscured: string[] = [];
  for (let step = 0; step < 4 * TASK_COUNT; step++) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      const actions = document.querySelector('[aria-label="Действия с выбранными"]');
      if (!active || !actions || actions.contains(active) || !document.querySelector("main")?.contains(active)) return null;
      return { label: active.getAttribute("aria-label") ?? active.textContent ?? "", bottom: active.getBoundingClientRect().bottom, panelTop: actions.getBoundingClientRect().top };
    });
    if (focus === null) continue;
    checked.push(focus.label);
    if (focus.bottom > focus.panelTop + 0.5) obscured.push(`${focus.label}: ${focus.bottom} > ${focus.panelTop}`);
  }
  expect(checked.length).toBeGreaterThan(2 * TASK_COUNT);
  expect(obscured).toEqual([]);

  await panel.getByRole("button", { name: "Приоритет" }).click();
  await panel.getByRole("button", { name: "критичный" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Изменена 1 из 1" })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await violations.settled()).toEqual([]);
});

test("подсказка про Пробел видна над списком, Alt+A (⌥A на macOS) из строки ведёт к действиям", async ({ page }) => {
  await page.goto("/p/triage");
  await expect(page.getByText("Пробел на задаче — выбрать её, Shift+Пробел — выбрать диапазон")).toBeVisible();

  await page.getByRole("link", { name: "Разбор 1", exact: true }).focus();
  await page.keyboard.press("Space");
  const panel = page.getByRole("region", { name: "Действия с выбранными" });
  await expect(panel.getByText(process.platform === "darwin" ? "⌥A — к действиям" : "Alt+A — к действиям")).toBeVisible();
  await page.keyboard.press("Alt+KeyA");
  await expect(panel.getByRole("button", { name: "Закрыть как неактуальные" })).toBeFocused();
});

test.describe("на сенсорном экране", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 800 } });

  test("подсказок о клавишах нет ни над списком, ни в панели", async ({ page }) => {
    await page.goto("/p/triage");
    await expect(page.getByRole("table")).toBeVisible();
    await select(page, 1);

    await expect(page.getByRole("region", { name: "Действия с выбранными" })).toBeVisible();
    await expect(page.getByText("Пробел на задаче")).toHaveCount(0);
    await expect(page.getByText("к действиям")).toHaveCount(0);
  });
});
