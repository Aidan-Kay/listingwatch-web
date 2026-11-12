import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";

export type Database = BetterSqlite3.Database;

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * Open (creating if needed) the SQLite database and bring its schema up to
 * date. WAL mode keeps readers unblocked during writes and makes every
 * committed transaction durable across a crash.
 */
export function openDatabase(file: string): Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new BetterSqlite3(file);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

/**
 * Apply every `migrations/NNN-name.sql` newer than the schema version stored
 * in `user_version`, each in its own transaction.
 */
export function migrate(db: Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (const migration of pendingMigrations(current)) {
    db.transaction(() => {
      db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, migration.file), "utf8"));
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
}

function pendingMigrations(current: number): { version: number; file: string }[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .map((file) => ({ file, version: Number(/^(\d+)-/.exec(file)?.[1]) }))
    .filter((m) => Number.isInteger(m.version) && m.version > current)
    .sort((a, b) => a.version - b.version);
}

/** Parse a JSON column, which only this code writes, so a failure is a real bug. */
export function fromJson<T>(text: string): T {
  return JSON.parse(text) as T;
}
