import type { Database } from "../db/database.ts";

/** Most items remembered per search; the oldest are forgotten first. */
export const MAX_ITEMS_PER_SEARCH = 10_000;

/**
 * What each search has fetched (`seen`) and which of those the user was shown
 * (`delivered`). They answer different questions: a filter change must forget
 * what was merely seen so newly-qualifying listings are reconsidered, but must
 * remember what was delivered so the user isn't shown it again.
 */
export class SearchItemRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  seenIds(searchId: string): Set<string> {
    const rows = this.db.prepare<[string], { item_id: string }>("SELECT item_id FROM search_items WHERE search_id = ?").all(searchId);
    return new Set(rows.map((row) => row.item_id));
  }

  markSeen(searchId: string, itemIds: readonly string[], at: string): void {
    const insert = this.db.prepare("INSERT OR IGNORE INTO search_items (search_id, item_id, seen_at) VALUES (?, ?, ?)");
    for (const itemId of itemIds) insert.run(searchId, itemId, at);
  }

  markDelivered(searchId: string, itemIds: readonly string[], at: string): void {
    const upsert = this.db.prepare(
      `INSERT INTO search_items (search_id, item_id, seen_at, delivered) VALUES (?, ?, ?, 1)
       ON CONFLICT (search_id, item_id) DO UPDATE SET delivered = 1`,
    );
    for (const itemId of itemIds) upsert.run(searchId, itemId, at);
  }

  /** Re-baseline: keep only what the user was shown. */
  forgetUndelivered(searchId: string): void {
    this.db.prepare("DELETE FROM search_items WHERE search_id = ? AND delivered = 0").run(searchId);
  }

  /** Drop the oldest items beyond the cap. */
  prune(searchId: string, keep = MAX_ITEMS_PER_SEARCH): void {
    this.db
      .prepare(
        `DELETE FROM search_items WHERE search_id = ? AND item_id IN (
           SELECT item_id FROM search_items WHERE search_id = ? ORDER BY seen_at DESC LIMIT -1 OFFSET ?)`,
      )
      .run(searchId, searchId, keep);
  }
}
