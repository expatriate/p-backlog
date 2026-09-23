import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type GraphFile = { path: string; hash: string; symbols: { name: string; owner?: string; kind: string; from: number; to: number }[] };

export async function makeGraph(
  repo: string,
  files: readonly GraphFile[],
  { schemaVersion = 13, repoRoot = repo }: { schemaVersion?: number; repoRoot?: string } = {},
): Promise<void> {
  await mkdir(join(repo, ".code-review-graph"), { recursive: true });
  const db = new DatabaseSync(join(repo, ".code-review-graph", "graph.db"));
  db.exec(
    "create table metadata (key text primary key, value text);" +
      "create table nodes (id integer primary key autoincrement, kind text not null, name text not null, qualified_name text not null unique, file_path text not null, line_start integer, line_end integer, is_test integer default 0, file_hash text);",
  );
  const meta = db.prepare("insert into metadata (key, value) values (?, ?)");
  meta.run("schema_version", String(schemaVersion));
  meta.run("repo_root", repoRoot);
  const node = db.prepare("insert into nodes (kind, name, qualified_name, file_path, line_start, line_end, file_hash) values (?, ?, ?, ?, ?, ?, ?)");
  for (const file of files) {
    const absolute = join(repo, file.path);
    node.run("File", absolute, absolute, absolute, 1, 10_000, file.hash);
    for (const symbol of file.symbols) {
      const qualifiedName = `${absolute}::${symbol.owner === undefined ? "" : `${symbol.owner}.`}${symbol.name}`;
      node.run(symbol.kind, symbol.name, qualifiedName, absolute, symbol.from, symbol.to, file.hash);
    }
  }
  db.close();
}
