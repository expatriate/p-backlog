import { join } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

export type GraphSymbol = { name: string; from: number; to: number };

export type CodeGraph = {
  symbolAt(path: string, line: number, fileHash: string): GraphSymbol | null;
  close(): void;
};

const GRAPH_FILE = join(".code-review-graph", "graph.db");
const SUPPORTED_SCHEMA = "13";

type SymbolRow = { name: string; line_start: number; line_end: number };

export function openCodeGraph(repo: string): CodeGraph | null {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(join(repo, GRAPH_FILE), { readOnly: true });
    const meta = readMetadata(db);
    if (meta.get("schema_version") !== SUPPORTED_SCHEMA || meta.get("repo_root") !== repo) {
      db.close();
      return null;
    }
    return codeGraph(db, repo);
  } catch {
    closeQuietly(db);
    return null;
  }
}

function readMetadata(db: DatabaseSync): Map<string, string> {
  const rows = db.prepare("select key, value from metadata").all() as { key: string; value: string }[];
  return new Map(rows.map((row) => [row.key, row.value]));
}

function codeGraph(db: DatabaseSync, repo: string): CodeGraph {
  const fresh = db.prepare("select 1 from nodes where kind = 'File' and file_path = ? and file_hash = ?");
  const enclosing = db.prepare(
    "select name, line_start, line_end from nodes where file_path = ? and kind != 'File' and line_start <= ? and line_end >= ? order by line_end - line_start asc limit 1",
  );

  return {
    symbolAt(path, line, fileHash) {
      const file = join(repo, path);
      if (ask(fresh, (statement) => statement.get(file, fileHash), undefined) === undefined) return null;
      const row = ask(enclosing, (statement) => statement.get(file, line, line) as SymbolRow | undefined, undefined);
      return row === undefined ? null : { name: row.name, from: row.line_start, to: row.line_end };
    },
    close() {
      closeQuietly(db);
    },
  };
}

function ask<T>(statement: StatementSync, run: (statement: StatementSync) => T, fallback: T): T {
  try {
    return run(statement);
  } catch {
    return fallback;
  }
}

function closeQuietly(db: DatabaseSync | null): void {
  try {
    db?.close();
  } catch {
    return;
  }
}
