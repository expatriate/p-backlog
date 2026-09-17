import { serve } from "@hono/node-server";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveBacklogRoot } from "../core/store/paths";
import { createApp } from "./app";
import { createChangeFeed } from "./change-feed";
import { localHosts } from "./guards";

const DEFAULT_PORT = 4317;

const home = homedir();
const root = resolveBacklogRoot(process.env, home);
const port = Number(process.env.PORT ?? DEFAULT_PORT);

await mkdir(root, { recursive: true });

const app = createApp({
  root,
  changes: createChangeFeed(root),
  allowedHosts: localHosts(port),
  staticDir: join(import.meta.dirname, "web"),
});

serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () => {
  process.stdout.write(`p-backlog: http://localhost:${port}\nКаталог беклога: ${root}\n`);
});
