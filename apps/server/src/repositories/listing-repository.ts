import type { FoundListing, Listing } from "@listingwatch/shared/schemas";
import { fromJson, type Database } from "../db/database.ts";

/** Most listings the feed holds; the oldest arrivals go first. */
export const FEED_MAX_SIZE = 500;

interface ListingRow {
  key: string;
  data: string;
  search_ids: string;
  matched_terms: string;
  found_at: string;
}

/** The feed: one row per listing, however many searches found it. */
export class ListingRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /** Newest arrivals first. */
  list(): Listing[] {
    return this.db.prepare<[], ListingRow>("SELECT * FROM listings ORDER BY id DESC").all().map(toListing);
  }

  get(key: string): Listing | null {
    const row = this.db.prepare<[string], ListingRow>("SELECT * FROM listings WHERE key = ?").get(key);
    return row ? toListing(row) : null;
  }

  /** Which of `keys` are on the feed, with their current search IDs. */
  searchIdsByKey(keys: readonly string[]): Map<string, string[]> {
    const lookup = this.db.prepare<[string], { search_ids: string }>("SELECT search_ids FROM listings WHERE key = ?");
    const found = new Map<string, string[]>();
    for (const key of keys) {
      const row = lookup.get(key);
      if (row) found.set(key, fromJson<string[]>(row.search_ids));
    }
    return found;
  }

  /** Add listings in the order given; the last one becomes the newest arrival. */
  insert(listings: readonly Listing[]): void {
    const insert = this.db.prepare(
      "INSERT INTO listings (key, data, search_ids, matched_terms, found_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO NOTHING",
    );
    for (const listing of listings) {
      const { key, searchIds, matchedTerms, foundAt, ...data } = listing;
      insert.run(key, JSON.stringify(data satisfies FoundListing), JSON.stringify(searchIds), JSON.stringify(matchedTerms), foundAt);
    }
  }

  setSearchIds(key: string, searchIds: readonly string[]): void {
    this.db.prepare("UPDATE listings SET search_ids = ? WHERE key = ?").run(JSON.stringify(searchIds), key);
  }

  delete(key: string): boolean {
    return this.db.prepare("DELETE FROM listings WHERE key = ?").run(key).changes > 0;
  }

  /**
   * Untag a deleted search from every listing. Listings that no other search
   * found are removed; their keys are returned.
   */
  removeSearch(searchId: string): { removed: string[]; retagged: { key: string; searchIds: string[] }[] } {
    const rows = this.db
      .prepare<[string], { key: string; search_ids: string }>("SELECT key, search_ids FROM listings WHERE EXISTS (SELECT 1 FROM json_each(search_ids) WHERE value = ?)")
      .all(searchId);
    const removed: string[] = [];
    const retagged: { key: string; searchIds: string[] }[] = [];
    for (const row of rows) {
      const remaining = fromJson<string[]>(row.search_ids).filter((id) => id !== searchId);
      if (remaining.length === 0) {
        this.delete(row.key);
        removed.push(row.key);
      } else {
        this.setSearchIds(row.key, remaining);
        retagged.push({ key: row.key, searchIds: remaining });
      }
    }
    return { removed, retagged };
  }

  clear(): void {
    this.db.prepare("DELETE FROM listings").run();
  }

  /** Drop the oldest arrivals beyond the cap and return their keys. */
  prune(keep = FEED_MAX_SIZE): string[] {
    const stale = this.db
      .prepare<[number], { key: string }>("SELECT key FROM listings ORDER BY id DESC LIMIT -1 OFFSET ?")
      .all(keep)
      .map((row) => row.key);
    const remove = this.db.prepare("DELETE FROM listings WHERE key = ?");
    for (const key of stale) remove.run(key);
    return stale;
  }

  /** Listings that arrived after `since` (all of them when null). */
  countFoundAfter(since: string | null): number {
    const row =
      since === null
        ? this.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM listings").get()
        : this.db.prepare<[string], { n: number }>("SELECT COUNT(*) AS n FROM listings WHERE found_at > ?").get(since);
    return row?.n ?? 0;
  }
}

function toListing(row: ListingRow): Listing {
  return {
    ...fromJson<FoundListing>(row.data),
    key: row.key,
    searchIds: fromJson<string[]>(row.search_ids),
    matchedTerms: fromJson<string[]>(row.matched_terms),
    foundAt: row.found_at,
  };
}
