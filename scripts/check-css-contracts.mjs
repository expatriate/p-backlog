import { readFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { isShippedSource, reportHits, walk } from "./lib/check-files.mjs";

const DEFAULT_ROOTS = ["src/web"];
const TOKENS_SEGMENTS = ["styles", "tokens.css"];
const CHECKED_EXTENSIONS = new Set(["css", "ts", "tsx"]);
const CSS_READ = /var\(\s*(--[a-z][\w-]*)/g;
const CSS_DECLARATION = /(?<![\w-])(--[a-z][\w-]*)\s*:/g;
const CSS_AT_PROPERTY = /@property\s+(--[a-z][\w-]*)/g;
const QUOTED_NAME = /["'`](--[a-z][\w-]*)["'`]/g;
const SCRIPT_OBJECT_KEY = /["'`](--[a-z][\w-]*)["'`]\s*:/g;
const SCRIPT_SET_PROPERTY = /setProperty\(\s*["'`](--[a-z][\w-]*)["'`]/g;

await reportHits(DEFAULT_ROOTS, findBrokenContractsIn);

async function findBrokenContractsIn(root) {
  const files = new Map();
  for await (const path of walk(root, (path) => isShippedSource(path, CHECKED_EXTENSIONS))) files.set(path, await readFile(path, "utf8"));
  const tokensPath = join(root, ...TOKENS_SEGMENTS);
  const tokensSource = files.get(tokensPath) ?? "";
  const tokens = declarationsIn(tokensSource);
  const undeclared = [...files].flatMap(([path, source]) => undeclaredIn(path, source, partnerSource(path, files), tokens));
  return [...undeclared, ...unreadTokensIn(tokensPath, tokensSource, files)];
}

function unreadTokensIn(tokensPath, tokensSource, files) {
  const read = new Set([...files].flatMap(([path, source]) => readsIn(path, source)));
  return tokensSource.split("\n").flatMap((line, index) =>
    declarationsIn(line)
      .filter((name) => !read.has(name))
      .map((name) => `${tokensPath}:${index + 1}: ${name} is declared but never read`),
  );
}

function readsIn(path, source) {
  return referencePatterns(path).flatMap((pattern) => namesIn(source, pattern));
}

function referencePatterns(path) {
  return path.endsWith(".css") ? [CSS_READ] : [CSS_READ, QUOTED_NAME];
}

function undeclaredIn(path, source, partner, tokens) {
  const isStyle = path.endsWith(".css");
  const declare = isStyle ? declarationsIn : settersIn;
  const declarePartner = isStyle ? settersIn : declarationsIn;
  const declared = new Set([...tokens, ...declare(source), ...declarePartner(partner)]);
  return source.split("\n").flatMap((line, index) =>
    readsIn(path, line)
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
