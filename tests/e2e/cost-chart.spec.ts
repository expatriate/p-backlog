import { expect, test } from "@playwright/test";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";

const projectDir = join(E2E_BACKLOG_DIR, "spend");

for (const width of [1280, 375]) {
  test(`график «Расход по дням» с осью дат и подсказкой на ${width}px`, async ({ page }) => {
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "project.md"), "---\nname: spend\nprefix: SPND\nrepos: []\n---\n", "utf8");
    const run = { at: new Date().toISOString(), command: "hook stop", cwd: "/nowhere", ms: 100, rssMb: 90, exitCode: 0 };
    await appendFile(join(E2E_BACKLOG_DIR, ".runs.jsonl"), `${JSON.stringify(run)}\n`, "utf8");

    await page.setViewportSize({ width, height: 900 });
    await page.goto("/stats/cost");
    const chart = page.getByRole("figure", { name: /^За 30\s+дней: .*запусков хука [1-9]/ });
    await expect(chart).toBeVisible();
    await expect(chart.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value").first()).toBeVisible();

    const plot = chart.locator(".recharts-surface");
    const box = await plot.boundingBox();
    if (box === null) throw new Error("график не нарисован");
    await page.mouse.move(box.x + box.width - 70, box.y + box.height / 2);
    await expect(chart.locator(".recharts-tooltip-wrapper")).toContainText("токен");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
}
