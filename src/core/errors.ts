export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function warnOnFailure<T>(work: Promise<T>, warn: (line: string) => void, message: (error: string) => string): Promise<T | null> {
  return work.catch((error: unknown) => {
    warn(message(errorText(error)));
    return null;
  });
}

export function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return errorCode(error) === code;
}

export function errorCodeOrText(error: unknown): string {
  const code = errorCode(error);
  return typeof code === "string" ? code : errorText(error);
}
