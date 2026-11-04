import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";

export async function reportHits(defaultRoots, hitsIn) {
  const roots = process.argv.slice(2);
  const results = await Promise.allSettled((roots.length > 0 ? roots : defaultRoots).map(hitsIn));
  const hits = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  for (const hit of hits) console.log(hit);
  for (const failure of failures) console.error(failure.message);
  process.exit(hits.length > 0 || failures.length > 0 ? 1 : 0);
}

export async function checkedFiles(root, isChecked) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter(isChecked)
    .toSorted();
  if (files.length === 0) throw new Error(`${root}: no files to check, the gate would pass without checking anything`);
  return files;
}

export function isShippedSource(path, extensions) {
  const segments = path.split(sep);
  const basename = segments.at(-1);
  return extensions.has(basename.split(".").pop()) && !segments.includes("testing") && !/\.test\.tsx?$/.test(basename);
}
