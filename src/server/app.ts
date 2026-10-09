import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { join } from "node:path";
import { errorText } from "../core/errors";
import type { Language } from "../core/i18n/language";
import { FileBusyError } from "../core/store/file-lock";
import { createApi } from "./api";
import type { ChangeFeed } from "./change-feed";
import { errorResponse, fileBusyResponse } from "./error-response";
import { allowLocalHostsOnly, limitRequestBody, requireJsonBody } from "./guards";
import { serverMessages } from "./messages";
import type { StatsServices } from "./stats-api";

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
  statsServices: StatsServices;
  staticDir?: string | undefined;
  now?: () => Date;
};

export function createApp({ root, readLanguage, changes, allowedHosts, home, statsServices, staticDir, now = () => new Date() }: AppOptions): Hono {
  const app = new Hono();
  app.use("*", APP_SECURITY_HEADERS);
  app.use("*", allowLocalHostsOnly(allowedHosts, readLanguage));
  app.use("/api/*", requireJsonBody(readLanguage));
  app.use("/api/*", limitRequestBody(readLanguage));
  app.route("/api", createApi({ root, readLanguage, changes, now, home, statsServices }));
  app.all("/api/*", async (c) => errorResponse(c, 404, serverMessages(await readLanguage()).unknownRoute(new URL(c.req.url).pathname)));

  app.onError(async (error, c) => {
    if (!(error instanceof FileBusyError)) return errorResponse(c, 500, errorText(error));
    return fileBusyResponse(c, await readLanguage(), error);
  });

  if (staticDir !== undefined) {
    app.use("*", serveStatic({ root: staticDir }));
    app.get("*", serveStatic({ path: join(staticDir, "index.html") }));
  }
  return app;
}
