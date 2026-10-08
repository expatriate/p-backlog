import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";

export async function reportHits(defaultRoots, hitsIn) {
  const roots = process.argv.slice(2);
  const hits = (await Promise.all((roots.length > 0 ? roots : defaultRoots).map(hitsIn))).flat();
  for (const hit of hits) console.log(hit);
  process.exit(hits.length > 0 ? 1 : 0);
}

export async function* walk(dir, isChecked) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path, isChecked);
    else if (isChecked(path)) yield path;
  }
}

export function isShippedSource(path, extensions) {
  const segments = path.split(sep);
  const basename = segments.at(-1);
  return extensions.has(basename.split(".").pop()) && !segments.includes("testing") && !/\.test\.tsx?$/.test(basename);
}
