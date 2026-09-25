import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LANGUAGES } from "../../src/core/i18n/language";
import { captureShots, startDemoServer, type Shot } from "./capture";
import { buildDemoBacklog, readDemoInputs } from "./demo-backlog";
import { ISOLATED_GIT_ENV } from "./demo-repo";

const REPO_ROOT = join(import.meta.dirname, "../..");
const DATA_DIR = join(REPO_ROOT, "docs/screenshots");
const PORT = Number(process.env.SCREENSHOTS_PORT ?? 4399);
const HERO_TASK = "holder-name";

Object.assign(process.env, ISOLATED_GIT_ENV);

for (const language of LANGUAGES) {
  const home = join(tmpdir(), "p-backlog-screenshots", language);
  const backlogRoot = join(home, "backlog");
  await rm(home, { recursive: true, force: true });
  await mkdir(join(home, ".claude"), { recursive: true });

  const { scenario, texts } = await readDemoInputs(DATA_DIR, language);
  const backlog = await buildDemoBacklog(scenario, texts, language, { home, backlogRoot }, REPO_ROOT);
  const shots: Shot[] = [
    { name: "tasks", path: "/" },
    { name: "task", path: `/t/${backlog.idOf(HERO_TASK)}`, viewport: { width: 1280, height: 1180 } },
    { name: "stats", path: "/stats" },
    { name: "effect", path: "/stats/effect" },
    { name: "code", path: "/p/shop-web/stats/code" },
  ];

  const server = await startDemoServer(REPO_ROOT, home, backlogRoot, PORT);
  try {
    const files = await captureShots(server.origin, language, shots, join(DATA_DIR, language));
    console.log(files.join("\n"));
  } finally {
    await server.stop();
  }
}
