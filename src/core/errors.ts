export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorCodeOrText(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  return typeof code === "string" ? code : errorText(error);
}
