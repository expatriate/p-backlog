import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";
import { collectCspViolations } from "./csp-violations";

const projectDir = join(E2E_BACKLOG_DIR, "grain");

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("масштаб «неделя / день» переключается на 320px без нарушений CSP и горизонтальной прокрутки", async ({ page }) => {
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "project.md"), "---\nname: grain\nprefix: GRN\nrepos: []\n---\n", "utf8");
  await writeFile(join(projectDir, "GRN-1.md"), `---\nid: GRN-1\ntitle: Масштаб графика\ncreated: ${new Date().toISOString()}\n---\n\nОписание.\n`, "utf8");
  const violations = await collectCspViolations(page);
  await page.setViewportSize({ width: 320, height: 900 });

  await page.goto("/stats");
  await page.getByRole("group", { name: "Масштаб графика «Долг»" }).getByRole("button", { name: "день" }).click();
  const daily = page.getByRole("region", { name: "Долг по дням" });
  await expect(daily.getByRole("figure", { name: /^30\s+дней: создано [1-9]/ })).toBeVisible();
  await expect(daily.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value").first()).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);

  await page.goto("/stats/cost");
  await page.getByRole("group", { name: "Масштаб графика «Расход»" }).getByRole("button", { name: "неделя" }).click();
  await expect(page.getByRole("region", { name: "Расход по неделям" }).getByRole("figure", { name: /^За 12\s+недель: / })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);

  await page.reload();
  await expect(page.getByRole("region", { name: "Расход по неделям" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await violations.settled()).toEqual([]);
});
