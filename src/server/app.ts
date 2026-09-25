import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { join } from "node:path";
import { errorText } from "../core/errors";
import type { Language } from "../core/i18n/language";
import { coreMessages } from "../core/messages";
import { FileBusyError } from "../core/store/file-lock";
import { createApi } from "./api";
import type { ChangeFeed } from "./change-feed";
import { allowLocalHostsOnly, requireJsonBody } from "./guards";
import { serverMessages } from "./messages";
import type { MemorySampler } from "./memory-sampler";
import type { UsageScanner } from "./usage-scanner";

const OWN_ORIGIN_ONLY = ["'self'"];

const APP_SECURITY_HEADERS = secureHeaders({
  xFrameOptions: "DENY",
  strictTransportSecurity: false,
  contentSecurityPolicy: {
    defaultSrc: OWN_ORIGIN_ONLY,
    imgSrc: [...OWN_ORIGIN_ONLY, "data:"],
    objectSrc: ["'none'"],
    baseUri: ["'none'"],
    formAction: OWN_ORIGIN_ONLY,
    frameAncestors: ["'none'"],
  },
});

export type AppOptions = {
  root: string;
  readLanguage: () => Promise<Language>;
  changes: ChangeFeed;
  allowedHosts: ReadonlySet<string>;
  home: string;
  usage: UsageScanner;
  memory: MemorySampler;
  staticDir?: string | undefined;
  now?: () => Date;
};

export function createApp({ root, readLanguage, changes, allowedHosts, home, usage, memory, staticDir, now = () => new Date() }: AppOptions): Hono {
  const app = new Hono();
  app.use("*", APP_SECURITY_HEADERS);
  app.use("*", allowLocalHostsOnly(allowedHosts, readLanguage));
  app.use("/api/*", requireJsonBody(readLanguage));
  app.route("/api", createApi({ root, readLanguage, changes, now, home, usage, memory }));
  app.all("/api/*", async (c) => c.json({ errors: [serverMessages(await readLanguage()).unknownRoute(new URL(c.req.url).pathname)] }, 404));

  app.onError(async (error, c) => {
    const text = error instanceof FileBusyError ? coreMessages(await readLanguage()).fileBusy(error.path, error.lock, error.seconds) : errorText(error);
    return c.json({ errors: [text] }, 500);
  });

  if (staticDir !== undefined) {
    app.use("*", serveStatic({ root: staticDir }));
    app.get("*", serveStatic({ path: join(staticDir, "index.html") }));
  }
  return app;
}
