import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { join } from "node:path";
import { errorText } from "../core/errors";
import { coreMessages } from "../core/messages";
import { FileBusyError } from "../core/store/file-lock";
import { createApi } from "./api";
import type { ChangeFeed } from "./change-feed";
import { allowLocalHostsOnly, requireJsonBody } from "./guards";
import { serverLanguage, serverMessages } from "./messages";
import type { MemorySampler } from "./memory-sampler";
import type { UsageScanner } from "./usage-scanner";

export type AppOptions = {
  root: string;
  changes: ChangeFeed;
  allowedHosts: ReadonlySet<string>;
  home: string;
  usage: UsageScanner;
  memory: MemorySampler;
  staticDir?: string | undefined;
  now?: () => Date;
};

export function createApp({ root, changes, allowedHosts, home, usage, memory, staticDir, now = () => new Date() }: AppOptions): Hono {
  const app = new Hono();
  app.use("*", allowLocalHostsOnly(allowedHosts, root));
  app.use("/api/*", requireJsonBody(root));
  app.route("/api", createApi({ root, changes, now, home, usage, memory }));
  app.all("/api/*", async (c) => c.json({ errors: [serverMessages(await serverLanguage(root)).unknownRoute(new URL(c.req.url).pathname)] }, 404));

  app.onError(async (error, c) => {
    const text = error instanceof FileBusyError ? coreMessages(await serverLanguage(root)).fileBusy(error.path, error.lock, error.seconds) : errorText(error);
    return c.json({ errors: [text] }, 500);
  });

  if (staticDir !== undefined) {
    app.use("*", serveStatic({ root: staticDir }));
    app.get("*", serveStatic({ path: join(staticDir, "index.html") }));
  }
  return app;
}
