import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";

const projectDir = join(E2E_BACKLOG_DIR, "focus");

test.beforeEach(async () => {
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "project.md"), "---\nname: focus\nprefix: FOC\nrepos: []\n---\n", "utf8");
});

test("после «Отмена» в диалоге удаления проекта, открытом мышью, фокус на кнопке удаления", async ({ page }) => {
  await page.goto("/");
  const deleteButton = page.getByRole("button", { name: "Удалить проект focus" });
  await deleteButton.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Отмена" }).click();

  await expect(dialog).toBeHidden();
  await expect(deleteButton).toBeFocused();
});

test("кнопка языка, нажатая с клавиатуры, не теряет фокус, пока язык меняется", async ({ page }) => {
  const languagePatch = page.waitForRequest((request) => request.url().endsWith("/api/settings") && request.method() === "PATCH");
  await page.route("**/api/settings", (route) => (route.request().method() === "PATCH" ? undefined : route.fallback()));

  await page.goto("/");
  const english = page.getByRole("button", { name: "EN", exact: true });
  await english.focus();
  await page.keyboard.press("Enter");
  await languagePatch;
  await page.evaluate(() => new Promise(requestAnimationFrame));

  await expect(english).toBeFocused();
});
