import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium, type Page } from "@playwright/test";
import sharp from "sharp";
import type { Language } from "../../src/core/i18n/language";
import { DAY_MS } from "../../src/core/model/lifecycle";
import { localeOf } from "../../src/core/i18n/language";

export type Shot = { name: string; path: string; viewport?: { width: number; height: number } };

type DemoServer = { origin: string; stop: () => void };

const DESKTOP = { width: 1280, height: 800 };
const SERVER_START_TIMEOUT_MS = 20_000;
const CHART_SETTLE_MS = 1500;
const SEEN_SINCE_DAYS = 1;
const QUANTIZED_PNG = { palette: true, quality: 90, effort: 10, compressionLevel: 9 } as const;

export async function startDemoServer(repoRoot: string, home: string, backlogRoot: string, port: number): Promise<DemoServer> {
  const origin = `http://127.0.0.1:${port}`;
  if (await responds(origin)) throw new Error(`Port ${port} is already taken; set SCREENSHOTS_PORT to a free port`);
  const child: ChildProcess = spawn(process.execPath, [join(repoRoot, "dist/server.js")], {
    env: { PATH: process.env.PATH, HOME: home, BACKLOG_DIR: backlogRoot, CLAUDE_CONFIG_DIR: join(home, ".claude"), PORT: String(port) },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const stop = () => {
    child.kill();
  };
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (!(await responds(origin))) {
    if (Date.now() > deadline || child.exitCode !== null) {
      stop();
      throw new Error(`The demo server did not start on ${origin}`);
    }
    await sleep(200);
  }
  return { origin, stop };
}

export async function captureShots(origin: string, language: Language, shots: readonly Shot[], outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const files: string[] = [];
  try {
    for (const shot of shots) {
      const context = await browser.newContext({
        viewport: shot.viewport ?? DESKTOP,
        deviceScaleFactor: 2,
        colorScheme: "dark",
        locale: localeOf(language),
        reducedMotion: "reduce",
      });
      await context.addInitScript((since) => window.localStorage.setItem("p-backlog.seen", JSON.stringify({ since, ids: [] })), Date.now() - SEEN_SINCE_DAYS * DAY_MS);
      const page = await context.newPage();
      await page.goto(`${origin}${shot.path}`);
      await settle(page);
      const file = join(outDir, `${shot.name}.png`);
      await sharp(await page.screenshot()).png(QUANTIZED_PNG).toFile(file);
      files.push(file);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return files;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.locator("main").first().waitFor();
  await page.waitForFunction(() => document.querySelector("[aria-busy='true']") === null);
  await sleep(CHART_SETTLE_MS);
}

async function responds(origin: string): Promise<boolean> {
  try {
    return (await fetch(`${origin}/api/projects`)).ok;
  } catch {
    return false;
  }
}
