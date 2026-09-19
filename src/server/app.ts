import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { join } from "node:path";
import { createApi } from "./api";
import type { ChangeFeed } from "./change-feed";
import { allowLocalHostsOnly, requireJsonBody } from "./guards";

export type AppOptions = {
  root: string;
  changes: ChangeFeed;
  allowedHosts: ReadonlySet<string>;
  home: string;
  staticDir?: string;
  now?: () => Date;
};

export function createApp({ root, changes, allowedHosts, home, staticDir, now = () => new Date() }: AppOptions): Hono {
  const app = new Hono();
  app.use("*", allowLocalHostsOnly(allowedHosts));
  app.use("/api/*", requireJsonBody);
  app.route("/api", createApi({ root, changes, now, home }));

  if (staticDir !== undefined) {
    app.use("*", serveStatic({ root: staticDir }));
    app.get("*", serveStatic({ path: join(staticDir, "index.html") }));
  }
  return app;
}
