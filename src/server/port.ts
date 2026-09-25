import type { ServerMessages } from "./messages.ru";

const DEFAULT_PORT = 4317;

function parsePort(value: string): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

export function requestedPort(value: string | undefined): number | null {
  return value === undefined || value === "" ? DEFAULT_PORT : parsePort(value);
}

export function readPort(value: string | undefined): number {
  return requestedPort(value) ?? DEFAULT_PORT;
}

export function listenFailure(error: NodeJS.ErrnoException, port: number, messages: ServerMessages): string {
  const reason = error.code === "EADDRINUSE" ? messages.portBusy(port) : error.message;
  return messages.listenFailed(reason);
}
