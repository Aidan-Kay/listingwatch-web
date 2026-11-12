import type { Search, SearchError, SearchInput, SearchStatus } from "@listingwatch/shared/schemas";
import { fromJson, type Database } from "../db/database.ts";

interface SearchRow {
  id: string;
  config: string;
  created_at: string;
  updated_at: string;
  last_polled_at: string | null;
  last_error: string | null;
  consecutive_errors: number;
  baseline_done: number;
  last_new_count: number;
}

/** Saved searches: configuration plus the runtime status of their last poll. */
export class SearchRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  list(): Search[] {
    const rows = this.db.prepare<[], SearchRow>("SELECT * FROM searches ORDER BY created_at").all();
    return rows.map(toSearch);
  }

  get(id: string): Search | null {
    const row = this.db.prepare<[string], SearchRow>("SELECT * FROM searches WHERE id = ?").get(id);
    return row ? toSearch(row) : null;
  }

  insert(id: string, config: SearchInput, now: string): Search {
    this.db
      .prepare("INSERT INTO searches (id, source, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, config.source, JSON.stringify(config), now, now);
    return this.get(id)!;
  }

  /** Replace the configuration. Source can't change; callers create a new search for that. */
  updateConfig(id: string, config: SearchInput, now: string): void {
    this.db.prepare("UPDATE searches SET config = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(config), now, id);
  }

  delete(id: string): boolean {
    return this.db.prepare("DELETE FROM searches WHERE id = ?").run(id).changes > 0;
  }

  recordSuccess(id: string, at: string, newCount: number): void {
    this.db
      .prepare(
        `UPDATE searches SET last_polled_at = ?, last_error = NULL, consecutive_errors = 0,
         baseline_done = 1, last_new_count = ? WHERE id = ?`,
      )
      .run(at, newCount, id);
  }

  recordFailure(id: string, error: SearchError, countTowardsBackoff: boolean): void {
    this.db
      .prepare(
        `UPDATE searches SET last_polled_at = ?, last_error = ?,
         consecutive_errors = consecutive_errors + ? WHERE id = ?`,
      )
      .run(error.at, JSON.stringify(error), countTowardsBackoff ? 1 : 0, id);
  }

  /** Make the next poll a baseline poll (recording what's listed without announcing it). */
  clearBaseline(id: string): void {
    this.db.prepare("UPDATE searches SET baseline_done = 0 WHERE id = ?").run(id);
  }
}

function toSearch(row: SearchRow): Search {
  const status: SearchStatus = {
    lastPolledAt: row.last_polled_at,
    lastError: row.last_error === null ? null : fromJson<SearchError>(row.last_error),
    consecutiveErrors: row.consecutive_errors,
    baselineDone: row.baseline_done === 1,
    lastNewCount: row.last_new_count,
  };
  return { ...fromJson<SearchInput>(row.config), id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, status };
}
