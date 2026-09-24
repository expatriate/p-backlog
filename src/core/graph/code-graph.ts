import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";

export type GraphSymbol = { qualifiedName: string; kind: string; from: number; to: number };

type GraphFileState = "fresh" | "changed" | "absent";

export type CodeGraph = {
  fileState(path: string, fileHash: string): GraphFileState;
  symbolAt(path: string, line: number, fileHash: string): GraphSymbol | null;
  close(): void;
};

const GRAPH_FILE = join(".code-review-graph", "graph.db");

export function hasCodeGraph(repo: string): boolean {
  return existsSync(join(repo, GRAPH_FILE));
}
const SUPPORTED_SCHEMA = "13";

type SymbolRow = { qualified_name: string; kind: string; line_start: number; line_end: number };

export function openCodeGraph(repo: string): CodeGraph | null {
  let db: DatabaseSync | null = null;
  try {
    const { DatabaseSync: SqliteDatabase } = process.getBuiltinModule("node:sqlite");
    db = new SqliteDatabase(join(repo, GRAPH_FILE), { readOnly: true });
    const meta = readMetadata(db);
    const root = meta.get("repo_root");
    if (meta.get("schema_version") !== SUPPORTED_SCHEMA || root === undefined || realpathSync(root) !== realpathSync(repo)) {
      db.close();
      return null;
    }
    return codeGraph(db, root);
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
  const fileNode = db.prepare("select file_hash from nodes where kind = 'File' and file_path = ?");
  const enclosing = db.prepare(
    "select qualified_name, kind, line_start, line_end from nodes where file_path = ? and kind != 'File' and line_start <= ? and line_end >= ? order by line_end - line_start asc limit 1",
  );

  const fileState = (path: string, fileHash: string): GraphFileState => {
    const row = ask(fileNode, (statement) => statement.get(join(repo, path)) as { file_hash: string | null } | undefined, undefined);
    if (row === undefined) return "absent";
    return row.file_hash === fileHash ? "fresh" : "changed";
  };

  return {
    fileState,
    symbolAt(path, line, fileHash) {
      if (fileState(path, fileHash) !== "fresh") return null;
      const file = join(repo, path);
      const row = ask(enclosing, (statement) => statement.get(file, line, line) as SymbolRow | undefined, undefined);
      return row === undefined ? null : { qualifiedName: row.qualified_name, kind: row.kind, from: row.line_start, to: row.line_end };
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
