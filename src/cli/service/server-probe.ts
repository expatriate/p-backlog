const PROBE_PATH = "/api/settings";

export function localOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export async function serverResponds(origin: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(`${origin}${PROBE_PATH}`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}
