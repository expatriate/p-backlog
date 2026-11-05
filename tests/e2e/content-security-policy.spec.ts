import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";
import { collectCspViolations } from "./csp-violations";
import { writeServedProject } from "./served-project";

const projectDir = join(E2E_BACKLOG_DIR, "csp");

test("политика безопасности не блокирует ни одну страницу приложения", async ({ page }) => {
  await writeServedProject(page.request, projectDir, {
    prefix: "CSP",
    tasks: [{ id: "CSP-1", fields: { title: "Проверка политики" }, body: "Описание." }],
  });

  const violations = await collectCspViolations(page);

  for (const path of ["/", "/p/csp/t/CSP-1", "/stats", "/stats/code", "/stats/quality", "/stats/effect", "/stats/cost"]) {
    const response = await page.goto(path);
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
  }

  expect(await violations.settled()).toEqual([]);
});
