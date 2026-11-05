import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";
import { tabSkipsControls } from "./keyboard-navigation";
import { untilServerSees } from "./served-project";

const projectDir = join(E2E_BACKLOG_DIR, "status");
const checklist = Array.from({ length: 120 }, (_, index) => `- [ ] Шаг ${index + 1}`).join("\n");

async function openCard(page: Page, answerSave: (route: Route) => Promise<void>): Promise<Locator> {
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "project.md"), "---\nname: status\nprefix: STAT\nrepos: []\n---\n", "utf8");
  await writeFile(join(projectDir, "STAT-1.md"), `---\nid: STAT-1\ntitle: Длинная задача\ncreated: 2026-09-17T10:00:00+03:00\n---\n\n## Чеклист\n${checklist}\n`, "utf8");
  await untilServerSees(page.request, projectDir);
  await page.route("**/api/tasks/STAT-1", (route) => (route.request().method() === "PATCH" ? answerSave(route) : route.fallback()));

  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/t/STAT-1");
  return page.getByRole("complementary", { name: "Задача STAT-1" });
}

const failSave = (route: Route) => route.fulfill({ status: 500, json: { errors: ["диск недоступен"] } });

const offsetInPinnedBlock = (alert: Locator) => alert.evaluate((element) => element.getBoundingClientRect().top - (element.parentElement?.getBoundingClientRect().top ?? 0));

test("ошибки в карточке не сдвигаются, когда следующее сохранение пишет «Сохраняем…»", async ({ page }) => {
  let saves = 0;
  const drawer = await openCard(page, (route) => {
    saves += 1;
    return saves === 1 ? failSave(route) : new Promise<void>(() => undefined);
  });
  await drawer.getByRole("textbox", { name: "Название задачи" }).fill("Новое название");
  await drawer.getByRole("textbox", { name: "Название задачи" }).blur();
  await expect(drawer.getByRole("alert").filter({ hasText: "не сохранено" })).toBeVisible();
  const firstAlert = drawer.getByRole("alert").first();
  const offsetBeforeSave = await offsetInPinnedBlock(firstAlert);

  await drawer.getByRole("combobox", { name: "Приоритет" }).selectOption({ label: "низкий" });

  await expect(drawer.getByRole("status")).toHaveText("Сохраняем…");
  expect(await offsetInPinnedBlock(firstAlert)).toBe(offsetBeforeSave);
});

test("поле, до которого дошли с клавиатуры, не прячется под закреплённой ошибкой карточки", async ({ page, browserName }) => {
  test.skip(tabSkipsControls(browserName), "Tab не доходит до чекбоксов");
  const drawer = await openCard(page, failSave);
  await drawer.getByRole("combobox", { name: "Приоритет" }).selectOption({ label: "низкий" });
  const alert = drawer.getByRole("alert").filter({ hasText: "диск недоступен" });
  await expect(alert).toBeVisible();
  const coveredStep = drawer.getByRole("checkbox", { name: "Шаг 60" });
  const stepBelowAlert = drawer.getByRole("checkbox", { name: "Шаг 61" });
  const scrollUntilAlertSticks = () => drawer.getByRole("checkbox", { name: "Шаг 120" }).scrollIntoViewIfNeeded();
  await scrollUntilAlertSticks();
  const alertBottom = await alert.evaluate((element) => element.getBoundingClientRect().bottom);
  const stepBelowAlertTop = await stepBelowAlert.evaluate((step) => step.getBoundingClientRect().top);
  await drawer.evaluate((panel, distance) => panel.scrollBy(0, distance), stepBelowAlertTop - alertBottom - 2);
  await stepBelowAlert.focus();

  await page.keyboard.press("Shift+Tab");

  await expect(coveredStep).toBeFocused();
  const [stepTop, pinnedAlertBottom] = await Promise.all([coveredStep.evaluate((element) => element.getBoundingClientRect().top), alert.evaluate((element) => element.getBoundingClientRect().bottom)]);
  expect(stepTop).toBeGreaterThanOrEqual(pinnedAlertBottom);
});
