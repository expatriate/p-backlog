import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";

const projectDir = join(E2E_BACKLOG_DIR, "spa");

async function writeTask(id: string, title: string): Promise<void> {
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    join(projectDir, `${id}.md`),
    `---\nid: ${id}\ntitle: ${title}\ncreated: 2026-09-17T10:00:00+03:00\n---\n\nОписание.\n`,
    "utf8",
  );
}

test("задача, созданную агентом в каталоге, видно без перезагрузки страницы", async ({ page }) => {
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "project.md"), "---\nname: spa\nprefix: SPA\nrepos: []\n---\n", "utf8");
  await writeTask("SPA-1", "Первая задача");

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Первая задача" })).toBeVisible();

  await writeTask("SPA-2", "Прилетела из каталога");

  await expect(page.getByRole("link", { name: "Прилетела из каталога" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: /spa/ })).toContainText("2");
});
