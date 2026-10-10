import { fileURLToPath } from "node:url";
import { DEFAULT_PORT } from "../src/core/server-address.ts";

const PORT_GUARD_URL = new URL("port-guard.mjs", import.meta.url);

export const PORT_GUARD_SETUP = fileURLToPath(PORT_GUARD_URL);

export const PORT_GUARD_ENV = {
  P_BACKLOG_GUARDED_PORT: String(DEFAULT_PORT),
  NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${PORT_GUARD_URL.href}`].filter(Boolean).join(" "),
};
