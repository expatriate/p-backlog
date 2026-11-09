import { expect, test, type Route } from "@playwright/test";
import { join } from "node:path";
import { writeSettings } from "../../src/core/store/settings";
import { E2E_BACKLOG_DIR } from "./backlog-dir";
import { writeServedProject } from "./served-project";
import { failOnPathError } from "../../src/core/store/testing/path-errors";

const projectDir = join(E2E_BACKLOG_DIR, "focus");

test.beforeEach(async ({ request }) => {
  await writeServedProject(request, projectDir, { prefix: "FOC" });
});

test.afterEach(() => writeSettings(E2E_BACKLOG_DIR, { language: "ru" }, failOnPathError));

test("после «Отмена» в диалоге удаления проекта, открытом мышью, фокус на кнопке удаления", async ({ page }) => {
  await page.goto("/");
  const deleteButton = page.getByRole("button", { name: "Удалить проект focus" });
  await deleteButton.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Отмена" }).click();

  await expect(dialog).toBeHidden();
  await expect(deleteButton).toBeFocused();
});

test("диалог удаления открытого проекта не берёт жирный шрифт у выделенной строки проекта", async ({ page }) => {
  await page.goto("/p/focus");
  await page.getByRole("button", { name: "Удалить проект focus" }).click();

  await expect(page.getByRole("dialog")).toHaveCSS("font-weight", "400");
});

test("кнопка языка, нажатая с клавиатуры, не теряет фокус, пока язык меняется", async ({ page }) => {
  const languagePatch = page.waitForRequest((request) => request.url().endsWith("/api/settings") && request.method() === "PATCH");
  let heldPatch: Route | undefined;
  await page.route("**/api/settings", (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    heldPatch = route;
    return undefined;
  });

  await page.goto("/");
  const english = page.getByRole("button", { name: "EN", exact: true });
  await english.focus();
  await page.keyboard.press("Enter");
  await languagePatch;
  await page.evaluate(() => new Promise(requestAnimationFrame));

  await expect(english).toBeFocused();
  await heldPatch?.abort();
});
