import { readFile } from "node:fs/promises";
import { isShippedSource, reportHits, walk } from "./lib/check-files.mjs";

const DEFAULT_ROOTS = ["src/web"];
const HOVER_CAPABLE = /^@media\s*\(\s*hover\s*:\s*hover\s*\)$/;

await reportHits(DEFAULT_ROOTS, async (root) => {
  const hits = [];
  for await (const path of walk(root, (path) => isShippedSource(path, new Set(["css"])))) hits.push(...ungatedHoversIn(path, await readFile(path, "utf8")));
  return hits;
});

function ungatedHoversIn(path, css) {
  const hits = [];
  const open = [];
  let preludeStart = 0;
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (char === "{") {
      const prelude = css
        .slice(preludeStart, index)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim();
      const gated = open.some((outer) => HOVER_CAPABLE.test(outer));
      if (!prelude.startsWith("@") && prelude.includes(":hover") && !gated) hits.push(`${path}:${lineOf(css, preludeStart + css.slice(preludeStart, index).search(/\S/))}`);
      open.push(prelude);
      preludeStart = index + 1;
    } else if (char === "}") {
      open.pop();
      preludeStart = index + 1;
    } else if (char === ";") {
      preludeStart = index + 1;
    }
  }
  return hits;
}

function lineOf(source, offset) {
  return source.slice(0, offset).split("\n").length;
}
