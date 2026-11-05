import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";
import { createdInOrder, writeServedProject } from "./served-project";

const projectDir = join(E2E_BACKLOG_DIR, "table");

test("открытая по ссылке задача внизу длинной таблицы прокручена в видимую область", async ({ page }) => {
  await writeServedProject(page.request, projectDir, {
    prefix: "TBL",
    tasks: Array.from({ length: 60 }, (_, index) => ({ id: `TBL-${index + 1}`, fields: { title: `Строка ${index + 1}`, created: createdInOrder(index) } })),
  });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto("/p/table/t/TBL-1");

  const table = page.getByRole("table");
  await expect(table.getByRole("row").last()).toContainText("Строка 1");
  await expect(table.getByRole("link", { name: "Строка 1", exact: true })).toBeInViewport();
});
