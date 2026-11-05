export function normalizedBody(body: string): string {
  return body.replace(/^\n+/, "").trimEnd();
}
