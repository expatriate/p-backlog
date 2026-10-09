const DEFAULT_PORT = 4317;

const DECIMAL_DIGITS = /^\d+$/;

export const LOOPBACK_HOST = "127.0.0.1";

export function portNumber(value: string): number | null {
  if (!DECIMAL_DIGITS.test(value)) return null;
  const port = Number(value);
  return port > 0 && port < 65536 ? port : null;
}

export function envPortOrDefault(value: string | undefined): number | null {
  return value === undefined || value === "" ? DEFAULT_PORT : portNumber(value);
}

export function loopbackOrigin(port: number): string {
  return `http://${LOOPBACK_HOST}:${port}`;
}

export function browserOrigin(port: number): string {
  return `http://localhost:${port}`;
}
