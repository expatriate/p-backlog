import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";
import { untilServerSees } from "./served-project";

const projectDir = join(E2E_BACKLOG_DIR, "table");

test("открытая по ссылке задача внизу длинной таблицы прокручена в видимую область", async ({ page }) => {
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "project.md"), "---\nname: table\nprefix: TBL\nrepos: []\n---\n", "utf8");
  for (let number = 1; number <= 60; number += 1) {
    await writeFile(join(projectDir, `TBL-${number}.md`), `---\nid: TBL-${number}\ntitle: Строка ${number}\ncreated: 2026-09-10T10:${String(number - 1).padStart(2, "0")}:00+03:00\n---\n`, "utf8");
  }
  await untilServerSees(page.request, projectDir);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto("/p/table/t/TBL-1");

  const table = page.getByRole("table");
  await expect(table.getByRole("row").last()).toContainText("Строка 1");
  await expect(table.getByRole("link", { name: "Строка 1", exact: true })).toBeInViewport();
});
