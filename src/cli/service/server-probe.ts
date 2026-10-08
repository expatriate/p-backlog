const PROBE_PATH = "/api/settings";

export async function serverResponds(origin: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(`${origin}${PROBE_PATH}`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}
