/**
 * Database abstraction — uses Turso when TURSO_DATABASE_URL is set,
 * otherwise falls back to local better-sqlite3.
 */
import { createClient, type Client } from "@libsql/client";
import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Read lazily so dotenv has time to load
function getTursoUrl() { return process.env.TURSO_DATABASE_URL?.trim(); }
function getTursoToken() { return process.env.TURSO_AUTH_TOKEN?.trim(); }
export function useTurso() { return !!(getTursoUrl() && getTursoToken()); }

let _turso: Client | null = null;
let _sqlite: InstanceType<typeof Database> | null = null;

function turso(): Client {
  if (!_turso) {
    _turso = createClient({ url: getTursoUrl()!, authToken: getTursoToken()! });
    const url = getTursoUrl()!;
    const masked = url.replace(/\/\/([^@]+)@/, "//***@");
    console.log(`[db] Connected to Turso: ${masked}`);
  }
  return _turso;
}

function sqlite(): InstanceType<typeof Database> {
  if (!_sqlite) {
    const DB_PATH = process.env.NODE_ENV === "production" ? "/data/data.db" : "data.db";
    try { mkdirSync(dirname(DB_PATH), { recursive: true }); } catch {}
    _sqlite = new Database(DB_PATH);
    _sqlite!.pragma("journal_mode = WAL");
    console.log(`[db] Using local SQLite: ${DB_PATH}`);
  }
  return _sqlite!;
}

/** Execute a single SQL statement with parameters. Returns { lastInsertRowid, changes } */
export async function dbRun(sql: string, ...args: any[]): Promise<{ lastInsertRowid: number | bigint; changes: number }> {
  if (useTurso()) {
    const r = await turso().execute({ sql, args });
    return { lastInsertRowid: r.lastInsertRowid ?? 0, changes: r.rowsAffected };
  }
  const r = sqlite().prepare(sql).run(...args);
  return { lastInsertRowid: r.lastInsertRowid, changes: r.changes };
}

/** Get a single row */
export async function dbGet<T = any>(sql: string, ...args: any[]): Promise<T | null> {
  if (useTurso()) {
    const r = await turso().execute({ sql, args });
    return (r.rows[0] as unknown as T) ?? null;
  }
  return (sqlite().prepare(sql).get(...args) as T) ?? null;
}

/** Get all matching rows */
export async function dbAll<T = any>(sql: string, ...args: any[]): Promise<T[]> {
  if (useTurso()) {
    const r = await turso().execute({ sql, args });
    return r.rows as unknown as T[];
  }
  return sqlite().prepare(sql).all(...args) as T[];
}

/** Execute raw multi-statement SQL (CREATE TABLE, etc.) */
export async function dbExec(sql: string): Promise<void> {
  if (useTurso()) {
    await turso().executeMultiple(sql);
  } else {
    sqlite().exec(sql);
  }
}

/** Safe ALTER TABLE — silently ignores "already exists" / "duplicate column" errors */
export async function safeAlter(sql: string): Promise<void> {
  try {
    if (useTurso()) {
      await turso().execute(sql);
    } else {
      sqlite().exec(sql);
    }
  } catch (_) { /* column/table already exists */ }
}

/** Get a drizzle instance for ORM queries */
export function getDrizzle() {
  if (useTurso()) {
    return drizzleLibsql(turso());
  }
  return drizzleSqlite(sqlite());
}
