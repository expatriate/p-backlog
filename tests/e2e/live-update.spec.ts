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

async function writeProject(): Promise<void> {
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "project.md"), "---\nname: spa\nprefix: SPA\nrepos: []\n---\n", "utf8");
}

test("задача, созданную агентом в каталоге, видно без перезагрузки страницы", async ({ page }) => {
  await writeProject();
  await writeTask("SPA-1", "Первая задача");

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Первая задача" })).toBeVisible();

  await writeTask("SPA-2", "Прилетела из каталога");

  await expect(page.getByRole("link", { name: "Прилетела из каталога" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("link", { name: /spa/ }) })).toContainText("2");
});

test("семь вкладок делят одну ленту: все загружаются, изменения доходят до каждой и после закрытия ведущей", async ({ context }) => {
  const TABS = 7;
  await writeProject();
  await writeTask("SPA-3", "Много вкладок");

  const pages = [];
  for (let tab = 0; tab < TABS; tab += 1) {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Много вкладок" })).toBeVisible();
    pages.push(page);
  }

  await writeTask("SPA-4", "Увидят все вкладки");
  for (const page of pages) await expect(page.getByRole("link", { name: "Увидят все вкладки" })).toBeVisible({ timeout: 10_000 });

  const [leader, ...followers] = pages;
  await leader?.close();
  await writeTask("SPA-5", "Лента пережила ведущую");
  for (const page of followers) await expect(page.getByRole("link", { name: "Лента пережила ведущую" })).toBeVisible({ timeout: 10_000 });
});
