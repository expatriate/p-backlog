import { isAbsolute, relative, sep } from "node:path";

export function relativeInside(container: string, path: string): string | null {
  const inside = relative(container, path);
  const outside = isAbsolute(inside) || inside === ".." || inside.startsWith(`..${sep}`);
  return outside ? null : inside.split(sep).join("/");
}
