export function cx(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
