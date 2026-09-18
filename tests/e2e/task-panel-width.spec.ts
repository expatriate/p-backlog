import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";

const projectDir = join(E2E_BACKLOG_DIR, "wrap");
const longPath = "src/features/components/SomeExtremelyLongComponentNameThatNeverBreaksAnywhere.tsx";

const task = `---
id: WRAP-1
title: Длинное содержимое
created: 2026-09-17T10:00:00+03:00
source: ${longPath}:1024
---

Идентификатор \`useRefreshedAuthorizationHeaderFromTheInterceptorChainWithRetryPolicy\` в тексте.

Лог: https://sentry.example.com/organizations/acme/issues/4815162342/events/9f8e7d6c5b4a39281706f5e4d3c2b1a0/?project=42

| ID | Файл | Строка | Статус | Владелец | Комментарий |
|---|---|---|---|---|---|
| 1 | ${longPath} | 142 | открыт | platform-team | повтор без токена |

## Чеклист
- [ ] Поправить ${longPath}
`;

for (const width of [1280, 375]) {
  test(`карточка задачи не прокручивается по ширине на ${width}px`, async ({ page }) => {
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "project.md"), "---\nname: wrap\nprefix: WRAP\nrepos: []\n---\n", "utf8");
    await writeFile(join(projectDir, "WRAP-1.md"), task, "utf8");

    await page.setViewportSize({ width, height: 800 });
    await page.goto("/t/WRAP-1");
    const drawer = page.getByRole("complementary", { name: "Задача WRAP-1" });
    await expect(drawer.getByRole("table")).toBeVisible();

    const overflow = await drawer.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBe(0);
  });
}
