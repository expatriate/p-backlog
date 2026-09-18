import { serve } from "@hono/node-server";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveBacklogRoot } from "../core/store/paths";
import { sweepClosed } from "../core/store/sweep";
import { createApp } from "./app";
import { createChangeFeed } from "./change-feed";
import { localHosts } from "./guards";
import { readPort } from "./port";
import { startSweeper } from "./sweeper";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

const home = homedir();
const root = resolveBacklogRoot(process.env, home);
const port = readPort(process.env.PORT);

await mkdir(root, { recursive: true });

const app = createApp({
  root,
  changes: createChangeFeed(root),
  allowedHosts: localHosts(port),
  staticDir: join(import.meta.dirname, "web"),
});

startSweeper({ sweep: () => sweepClosed(root, new Date()), intervalMs: SWEEP_INTERVAL_MS, log: (line) => process.stdout.write(`${line}\n`) });

serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () => {
  process.stdout.write(`p-backlog: http://localhost:${port}\nКаталог беклога: ${root}\n`);
});
