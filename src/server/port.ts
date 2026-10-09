import type { ServerMessages } from "./messages";

export function listenFailure(error: NodeJS.ErrnoException, port: number, messages: ServerMessages): string {
  const reason = error.code === "EADDRINUSE" ? messages.portBusy(port) : error.message;
  return messages.listenFailed(reason);
}
