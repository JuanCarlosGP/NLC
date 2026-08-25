import type { CatalogDb, SqlValue } from "@/lib/db/types";

type Row = Record<string, SqlValue>;

const TABLES = [
  "meta",
  "artists",
  "albums",
  "tracks",
  "recents",
  "favorites",
  "playlists",
  "playlist_tracks",
  "wealth_accounts",
  "wealth_assets",
  "wealth_tx",
  "wealth_goals",
] as const;

const PRIMARY: Record<string, string[]> = {
  meta: ["key"],
  artists: ["id"],
  albums: ["id"],
  tracks: ["id"],
  recents: ["position"],
  favorites: ["position"],
  playlists: ["id"],
  playlist_tracks: ["playlist_id", "position"],
  wealth_accounts: ["id"],
  wealth_assets: ["id"],
  wealth_tx: ["id"],
  wealth_goals: ["id"],
};

function emptyTables(): Record<string, Row[]> {
  return Object.fromEntries(TABLES.map((name) => [name, []])) as Record<string, Row[]>;
}

let tables = emptyTables();

function compact(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function splitArgs(raw: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of raw) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function sameKey(row: Row, keys: string[], values: Row): boolean {
  return keys.every((key) => String(row[key] ?? "") === String(values[key] ?? ""));
}

function parseInsert(sql: string): { table: string; columns: string[]; replace: boolean } | null {
  const match = compact(sql).match(
    /^INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i,
  );
  if (!match) return null;
  return {
    table: match[1]!.toLowerCase(),
    columns: match[2]!.split(",").map((part) => part.trim()),
    replace: /^INSERT\s+OR\s+REPLACE/i.test(compact(sql)),
  };
}

function parseUpdate(sql: string): { table: string; sets: string[]; where: string | null } | null {
  const match = compact(sql).match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
  if (!match) return null;
  return {
    table: match[1]!.toLowerCase(),
    sets: match[2]!.split(",").map((part) => part.trim()),
    where: match[3] ?? null,
  };
}

function parseDelete(sql: string): { table: string; where: string | null } | null {
  const match = compact(sql).match(/^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
  if (!match) return null;
  return { table: match[1]!.toLowerCase(), where: match[2] ?? null };
}

function nextParam(params: SqlValue[], index: { i: number }): SqlValue {
  const value = params[index.i] ?? null;
  index.i += 1;
  return value;
}

function evalExpr(expr: string, row: Row, params: SqlValue[], index: { i: number }): SqlValue {
  const trimmed = expr.trim();
  if (trimmed === "?") return nextParam(params, index);
  if (trimmed === "NULL") return null;
  if (trimmed === "excluded.title") return row.title ?? null;
  const num = trimmed.match(/^-?\d+$/);
  if (num) return Number(num[0]);
  const str = trimmed.match(/^'(.*)'$/);
  if (str) return str[1] ?? "";
  const ref = trimmed.match(/^(?:[\w]+\.)?(\w+)$/);
  if (ref) return row[ref[1]!] ?? null;
  return trimmed;
}

function like(value: SqlValue, pattern: SqlValue): boolean {
  const hay = String(value ?? "").toLowerCase();
  const raw = String(pattern ?? "").toLowerCase();
  const escaped = raw.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`).test(hay);
}

function evalWhere(where: string | null, row: Row, params: SqlValue[], index: { i: number }): boolean {
  if (!where) return true;
  const parts = where.split(/\s+AND\s+/i);
  return parts.every((part) => {
    const inMatch = part.match(/^(\w+)\s+IN\s*\((.+)\)$/i);
    if (inMatch) {
      const values = inMatch[2]!.split(",").map((item) => evalExpr(item, row, params, index));
      return values.some((value) => String(value ?? "") === String(row[inMatch[1]!] ?? ""));
    }
    const likeMatch = part.match(/^(\w+)\s+LIKE\s+\?\s+ESCAPE\s+'\\'$/i);
    if (likeMatch) return like(row[likeMatch[1]!], nextParam(params, index));
    const ne = part.match(/^(\w+)\s*(!=|<>)\s*(.+)$/);
    if (ne) return String(row[ne[1]!] ?? "") !== String(evalExpr(ne[3]!, row, params, index) ?? "");
    const eq = part.match(/^(\w+)\s*=\s*(.+)$/);
    if (eq) return String(row[eq[1]!] ?? "") === String(evalExpr(eq[2]!, row, params, index) ?? "");
    const notNull = part.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i);
    if (notNull) return row[notNull[1]!] != null;
    return true;
  });
}

function aliasName(part: string): { source: string; alias: string } {
  const match = part.trim().match(/^(?:[\w]+\.)?(\w+)(?:\s+as\s+(\w+))?$/i);
  if (!match) return { source: part.trim(), alias: part.trim() };
  return { source: match[1]!, alias: match[2] ?? match[1]! };
}

function project(row: Row, columns: string): Row {
  if (columns.trim() === "*") return { ...row };
  const out: Row = {};
  for (const part of columns.split(",")) {
    const { source, alias } = aliasName(part);
    out[alias] = row[source] ?? null;
  }
  return out;
}

function sortRows(rows: Row[], order: string | null): Row[] {
  if (!order) return rows;
  const cols = order
    .replace(/\s+COLLATE\s+NOCASE/gi, "")
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0]!.replace(/^[\w]+\./, ""));
  return [...rows].sort((a, b) => {
    for (const col of cols) {
      const left = String(a[col] ?? "").toLowerCase();
      const right = String(b[col] ?? "").toLowerCase();
      if (left < right) return -1;
      if (left > right) return 1;
    }
    return 0;
  });
}

function selectRows(sql: string, params: SqlValue[]): Row[] {
  const compactSql = compact(sql);
  const count = compactSql.match(/^SELECT COUNT\(\*\) as n FROM (\w+)$/i);
  if (count) return [{ n: tables[count[1]!.toLowerCase()]?.length ?? 0 }];

  const sum = compactSql.match(/^SELECT([\s\S]+)FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
  if (sum && /SUM\(/i.test(sum[1] ?? "")) {
    const rows = (tables[sum[2]!.toLowerCase()] ?? []).filter((row) =>
      evalWhere(sum[3] ?? null, row, params, { i: 0 }),
    );
    return [
      {
        ready: rows.filter((row) => row.offline_status === "ready").length,
        total: rows.filter((row) => row.on_nas === 1).length,
        bytes: rows
          .filter((row) => row.offline_status === "ready")
          .reduce((acc, row) => acc + (Number(row.local_bytes) || 0), 0),
        pending: rows.filter((row) => row.on_nas === 1 && row.offline_status !== "ready").length,
      },
    ];
  }

  const join = compactSql.match(
    /^SELECT DISTINCT a\.id, a\.name, a\.album_count as albumCount, a\.cover_id as coverId FROM artists a INNER JOIN tracks t ON t\.artist_id = a\.id WHERE t\.offline_status = 'ready' ORDER BY a\.name COLLATE NOCASE$/i,
  );
  if (join) {
    const readyArtists = new Set(
      tables.tracks.filter((row) => row.offline_status === "ready").map((row) => String(row.artist_id ?? "")),
    );
    return sortRows(
      tables.artists
        .filter((row) => readyArtists.has(String(row.id ?? "")))
        .map((row) => ({
          id: row.id ?? null,
          name: row.name ?? null,
          albumCount: row.album_count ?? null,
          coverId: row.cover_id ?? null,
        })),
      "name",
    );
  }

  const distinct = compactSql.match(
    /^SELECT DISTINCT (\w+) FROM (\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(.+))?$/i,
  );
  if (distinct && !/INNER JOIN/i.test(compactSql)) {
    const seen = new Set<string>();
    const rows: Row[] = [];
    for (const row of tables[distinct[2]!.toLowerCase()] ?? []) {
      if (!evalWhere(distinct[3] ?? null, row, params, { i: 0 })) continue;
      const key = String(row[distinct[1]!] ?? "");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ [distinct[1]!]: row[distinct[1]!] ?? null });
    }
    return sortRows(rows, distinct[4] ?? null);
  }

  const select = compactSql.match(
    /^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(.+))?$/i,
  );
  if (!select) return [];
  const filtered = (tables[select[2]!.toLowerCase()] ?? []).filter((row) =>
    evalWhere(select[3] ?? null, row, params, { i: 0 }),
  );
  return sortRows(filtered.map((row) => project(row, select[1]!)), select[4] ?? null);
}

function run(sql: string, params: SqlValue[]): void {
  const compactSql = compact(sql);
  if (/^PRAGMA\b/i.test(compactSql) || /^CREATE\b/i.test(compactSql)) return;

  const del = parseDelete(compactSql);
  if (del) {
    const index = { i: 0 };
    tables[del.table] = (tables[del.table] ?? []).filter((row) => !evalWhere(del.where, row, params, index));
    return;
  }

  const update = parseUpdate(compactSql);
  if (update) {
    const whereIndex = { i: 0 };
    const assignments = update.sets.map((set) => {
      const [col, expr] = set.split("=").map((part) => part.trim());
      return { col: col!, expr: expr ?? "NULL" };
    });
    const questionSets = assignments.filter((item) => item.expr === "?").length;
    tables[update.table] = (tables[update.table] ?? []).map((row) => {
      const probe = { i: questionSets };
      if (!evalWhere(update.where, row, params, probe)) return row;
      const next = { ...row };
      const valueIndex = { i: 0 };
      for (const item of assignments) {
        next[item.col] = item.expr === "?" ? nextParam(params, valueIndex) : evalExpr(item.expr, row, params, valueIndex);
      }
      return next;
    });
    return;
  }

  const insert = parseInsert(compactSql);
  if (!insert) return;
  const valuesMatch = compactSql.match(/VALUES\s*\((.+)\)\s*(?:ON CONFLICT|$)/i);
  const valueExprs = valuesMatch ? splitArgs(valuesMatch[1]!) : insert.columns.map(() => "?");
  const row: Row = {};
  const valueIndex = { i: 0 };
  insert.columns.forEach((column, i) => {
    row[column] = evalExpr(valueExprs[i] ?? "NULL", {}, params, valueIndex);
  });
  const keys = PRIMARY[insert.table] ?? ["id"];
  const existing = (tables[insert.table] ?? []).findIndex((item) => sameKey(item, keys, row));
  if (existing >= 0) {
    if (insert.replace || /ON CONFLICT/i.test(compactSql)) {
      tables[insert.table][existing] = { ...tables[insert.table][existing], ...row };
    }
    return;
  }
  tables[insert.table] = [...(tables[insert.table] ?? []), row];
}

export function createMemoryDb(): CatalogDb {
  return {
    async execAsync(sql: string) {
      for (const part of sql.split(";")) {
        const piece = part.trim();
        if (piece) run(piece, []);
      }
    },
    async runAsync(sql: string, ...params: SqlValue[]) {
      run(sql, params);
      return { changes: 1 };
    },
    async getAllAsync<T>(sql: string, ...params: SqlValue[]) {
      return selectRows(sql, params) as T[];
    },
    async getFirstAsync<T>(sql: string, ...params: SqlValue[]) {
      return (selectRows(sql, params)[0] as T | undefined) ?? null;
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      const snapshot = JSON.stringify(tables);
      try {
        await fn();
      } catch (error) {
        tables = JSON.parse(snapshot) as Record<string, Row[]>;
        throw error;
      }
    },
  };
}
