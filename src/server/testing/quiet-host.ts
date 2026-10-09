import type { StartServerOptions } from "../start";

export const QUIET_HOST: Pick<StartServerOptions, "log" | "warn" | "platform" | "settledLanguage"> = { log: () => undefined, warn: () => undefined, platform: "linux", settledLanguage: "ru" };
