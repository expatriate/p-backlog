const DEFAULT_PORT = 4317;

export function readPort(value: string | undefined): number {
  const port = Number(value);
  return value !== undefined && Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

export function listenFailure(error: NodeJS.ErrnoException, port: number): string {
  const reason = error.code === "EADDRINUSE" ? `порт ${port} уже занят` : error.message;
  return `p-backlog не запустился: ${reason}`;
}
