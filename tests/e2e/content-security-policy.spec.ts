import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";

const projectDir = join(E2E_BACKLOG_DIR, "csp");

test("политика безопасности не блокирует ни одну страницу приложения", async ({ page }) => {
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "project.md"), "---\nname: csp\nprefix: CSP\nrepos: []\n---\n", "utf8");
  await writeFile(join(projectDir, "CSP-1.md"), "---\nid: CSP-1\ntitle: Проверка политики\ncreated: 2026-09-17T10:00:00+03:00\n---\n\nОписание.\n", "utf8");

  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });

  for (const path of ["/", "/p/csp/t/CSP-1", "/stats", "/stats/code", "/stats/quality", "/stats/effect", "/stats/cost"]) {
    const response = await page.goto(path);
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
  }

  expect(violations).toEqual([]);
});
