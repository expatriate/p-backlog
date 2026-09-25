import { serverRu, type ServerMessages } from "./messages.ru";

const DEFAULT_PORT = 4317;

export function parsePort(value: string): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

export function readPort(value: string | undefined): number {
  return (value === undefined ? null : parsePort(value)) ?? DEFAULT_PORT;
}

export function listenFailure(error: NodeJS.ErrnoException, port: number, messages: ServerMessages = serverRu): string {
  const reason = error.code === "EADDRINUSE" ? messages.portBusy(port) : error.message;
  return messages.listenFailed(reason);
}
