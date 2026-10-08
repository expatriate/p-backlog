import type { StartServerOptions } from "../start";

export const QUIET_HOST: Pick<StartServerOptions, "log" | "warn" | "platform"> = { log: () => undefined, warn: () => undefined, platform: "linux" };
