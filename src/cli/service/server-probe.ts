const PROBE_PATH = "/api/settings";

export async function serverResponds(origin: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(`${origin}${PROBE_PATH}`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch (error) {
    if (isUnreachable(error)) return false;
    throw error;
  }
}

function isUnreachable(fetchFailure: unknown): boolean {
  const networkFailed = fetchFailure instanceof TypeError;
  const timedOut = fetchFailure instanceof DOMException && fetchFailure.name === "TimeoutError";
  return networkFailed || timedOut;
}
