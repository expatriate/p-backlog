import { once } from "node:events";
import { createServer } from "node:net";
import { join } from "node:path";
import { ISOLATED_GIT_ENV } from "../src/core/store/testing/temp-dirs";

export function isolatedHomeEnv(home: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...ISOLATED_GIT_ENV,
    HOME: home,
    USERPROFILE: home,
    BACKLOG_DIR: join(home, "store"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    CODEX_HOME: join(home, ".codex"),
  };
}

export async function freePort(): Promise<number> {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  if (address === null || typeof address === "string") throw new Error("нет порта");
  return address.port;
}
