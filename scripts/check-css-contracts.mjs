import { readdir, readFile } from "node:fs/promises";
import { join, parse, sep } from "node:path";

const DEFAULT_ROOTS = ["src/web"];
const TOKENS_SEGMENTS = ["styles", "tokens.css"];
const CHECKED_EXTENSIONS = new Set(["css", "ts", "tsx"]);
const CSS_READ = /var\(\s*(--[a-z][\w-]*)/g;
const CSS_DECLARATION = /(?<![\w-])(--[a-z][\w-]*)\s*:/g;
const CSS_AT_PROPERTY = /@property\s+(--[a-z][\w-]*)/g;
const QUOTED_NAME = /["'`](--[a-z][\w-]*)["'`]/g;
const SCRIPT_OBJECT_KEY = /["'`](--[a-z][\w-]*)["'`]\s*:/g;
const SCRIPT_SET_PROPERTY = /setProperty\(\s*["'`](--[a-z][\w-]*)["'`]/g;

const roots = process.argv.slice(2);
const hits = (await Promise.all((roots.length > 0 ? roots : DEFAULT_ROOTS).map(findBrokenContractsIn))).flat();

for (const hit of hits) console.log(hit);
process.exit(hits.length > 0 ? 1 : 0);

async function findBrokenContractsIn(root) {
  const files = new Map();
  for await (const path of walk(root)) files.set(path, await readFile(path, "utf8"));
  const tokens = declarationsIn(files.get(join(root, ...TOKENS_SEGMENTS)) ?? "");
  return [...files].flatMap(([path, source]) => undeclaredIn(path, source, partnerSource(path, files), tokens));
}

function undeclaredIn(path, source, partner, tokens) {
  const isStyle = path.endsWith(".css");
  const declare = isStyle ? declarationsIn : settersIn;
  const declarePartner = isStyle ? settersIn : declarationsIn;
  const declared = new Set([...tokens, ...declare(source), ...declarePartner(partner)]);
  const references = isStyle ? [CSS_READ] : [CSS_READ, QUOTED_NAME];
  return source.split("\n").flatMap((line, index) =>
    references
      .flatMap((pattern) => namesIn(line, pattern))
      .filter((name) => !declared.has(name))
      .map((name) => `${path}:${index + 1}: ${name}`),
  );
}

function partnerSource(path, files) {
  const { dir, name, ext } = parse(path);
  const stem = name.replace(/\.module$/, "");
  const partners = ext === ".css" ? [`${stem}.ts`, `${stem}.tsx`] : [`${name}.module.css`];
  return partners.map((partner) => files.get(join(dir, partner)) ?? "").join("\n");
}

function declarationsIn(css) {
  return [...namesIn(css, CSS_DECLARATION), ...namesIn(css, CSS_AT_PROPERTY)];
}

function settersIn(script) {
  return [...namesIn(script, SCRIPT_OBJECT_KEY), ...namesIn(script, SCRIPT_SET_PROPERTY)];
}

function namesIn(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
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
  if (!CHECKED_EXTENSIONS.has(basename.split(".").pop())) return false;
  if (segments.includes("testing")) return false;
  return !/\.test\.tsx?$/.test(basename);
}
