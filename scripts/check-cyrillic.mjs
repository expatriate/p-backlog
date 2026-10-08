import { readFile } from "node:fs/promises";
import { sep } from "node:path";
import { isShippedSource, reportHits, walk } from "./lib/check-files.mjs";

const DEFAULT_ROOTS = ["src", "scripts"];
const CHECKED_EXTENSIONS = new Set(["ts", "tsx", "html", "mjs", "js", "css", "json"]);
const CORE_RU_CATALOG_SEGMENTS = ["src", "core", "messages", "ru.ts"];
const CYRILLIC = /\p{Script=Cyrillic}/u;

await reportHits(DEFAULT_ROOTS, findCyrillicIn);

async function findCyrillicIn(root) {
  const hits = [];
  for await (const file of walk(root, shouldCheck)) hits.push(...(await cyrillicHits(file)));
  return hits;
}

function shouldCheck(path) {
  return isShippedSource(path, CHECKED_EXTENSIONS) && !isRussianCatalog(path);
}

function isRussianCatalog(path) {
  const segments = path.split(sep);
  return segments.at(-1) === "messages.ru.ts" || segments.slice(-CORE_RU_CATALOG_SEGMENTS.length).join("/") === CORE_RU_CATALOG_SEGMENTS.join("/");
}

async function cyrillicHits(path) {
  const lines = (await readFile(path, "utf8")).split("\n");
  return lines.flatMap((line, index) => (CYRILLIC.test(line) ? [`${path}:${index + 1}`] : []));
}
