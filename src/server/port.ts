import type { ServerMessages } from "./messages";

const DEFAULT_PORT = 4317;

const DECIMAL_DIGITS = /^\d+$/;

export const LOOPBACK_HOST = "127.0.0.1";

function decimalPort(value: string): number | null {
  if (!DECIMAL_DIGITS.test(value)) return null;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

export function requestedPort(value: string | undefined): number | null {
  return value === undefined || value === "" ? DEFAULT_PORT : decimalPort(value);
}

export function loopbackOrigin(port: number): string {
  return `http://${LOOPBACK_HOST}:${port}`;
}

export function browserOrigin(port: number): string {
  return `http://localhost:${port}`;
}

export function listenFailure(error: NodeJS.ErrnoException, port: number, messages: ServerMessages): string {
  const reason = error.code === "EADDRINUSE" ? messages.portBusy(port) : error.message;
  return messages.listenFailed(reason);
}
