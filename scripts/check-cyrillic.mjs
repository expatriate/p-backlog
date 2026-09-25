import { readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";

const DEFAULT_ROOTS = ["src", "scripts"];
const CHECKED_EXTENSIONS = new Set(["ts", "tsx", "html", "mjs", "js", "css", "json"]);
const CORE_RU_CATALOG_SEGMENTS = ["src", "core", "messages", "ru.ts"];
const CYRILLIC = /\p{Script=Cyrillic}/u;

const roots = process.argv.slice(2);
const hits = (await Promise.all((roots.length > 0 ? roots : DEFAULT_ROOTS).map(findCyrillicIn))).flat();

for (const hit of hits) console.log(hit);
process.exit(hits.length > 0 ? 1 : 0);

async function findCyrillicIn(root) {
  const hits = [];
  for await (const file of walk(root)) hits.push(...(await cyrillicHits(file)));
  return hits;
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (shouldCheck(path)) yield path;
  }
}

function shouldCheck(path) {
  const segments = path.split(sep);
  const basename = segments.at(-1);
  const extension = basename.split(".").pop();
  if (!CHECKED_EXTENSIONS.has(extension)) return false;
  if (segments.includes("testing")) return false;
  if (basename === "messages.ru.ts") return false;
  if (/\.test\.tsx?$/.test(basename)) return false;
  if (segments.slice(-CORE_RU_CATALOG_SEGMENTS.length).join("/") === CORE_RU_CATALOG_SEGMENTS.join("/")) return false;
  return true;
}

async function cyrillicHits(path) {
  const lines = (await readFile(path, "utf8")).split("\n");
  return lines.flatMap((line, index) => (CYRILLIC.test(line) ? [`${path}:${index + 1}`] : []));
}
