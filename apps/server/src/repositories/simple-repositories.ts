import { settingsSchema, type Favourite, type Listing, type MatchList, type Settings } from "@listingwatch/shared/schemas";
import { fromJson, type Database } from "../db/database.ts";

/** Saved listing snapshots, newest first. */
export class FavouriteRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  list(): Favourite[] {
    return this.db
      .prepare<[], { listing: string; saved_at: string }>("SELECT listing, saved_at FROM favourites ORDER BY saved_at DESC")
      .all()
      .map((row) => ({ listing: fromJson<Listing>(row.listing), savedAt: row.saved_at }));
  }

  put(listing: Listing, savedAt: string): void {
    this.db
      .prepare("INSERT INTO favourites (key, listing, saved_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET listing = excluded.listing")
      .run(listing.key, JSON.stringify(listing), savedAt);
  }

  delete(key: string): boolean {
    return this.db.prepare("DELETE FROM favourites WHERE key = ?").run(key).changes > 0;
  }

  clear(): void {
    this.db.prepare("DELETE FROM favourites").run();
  }
}

interface MatchListRow {
  id: string;
  name: string;
  terms: string;
  version: number;
  updated_at: string;
}

export class MatchListRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  list(): MatchList[] {
    return this.db.prepare<[], MatchListRow>("SELECT * FROM match_lists ORDER BY name COLLATE NOCASE").all().map(toMatchList);
  }

  get(id: string): MatchList | null {
    const row = this.db.prepare<[string], MatchListRow>("SELECT * FROM match_lists WHERE id = ?").get(id);
    return row ? toMatchList(row) : null;
  }

  upsert(list: MatchList): void {
    this.db
      .prepare(
        `INSERT INTO match_lists (id, name, terms, version, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, terms = excluded.terms,
         version = excluded.version, updated_at = excluded.updated_at`,
      )
      .run(list.id, list.name, JSON.stringify(list.terms), list.version, list.updatedAt);
  }

  delete(id: string): boolean {
    return this.db.prepare("DELETE FROM match_lists WHERE id = ?").run(id).changes > 0;
  }
}

function toMatchList(row: MatchListRow): MatchList {
  return { id: row.id, name: row.name, terms: fromJson<string[]>(row.terms), version: row.version, updatedAt: row.updated_at };
}

export class SettingsRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /** Stored settings, with defaults filling anything missing or invalid. */
  get(): Settings {
    const row = this.db.prepare<[], { data: string }>("SELECT data FROM settings WHERE id = 1").get();
    const parsed = settingsSchema.safeParse(row ? fromJson<unknown>(row.data) : {});
    return parsed.success ? parsed.data : settingsSchema.parse({});
  }

  save(settings: Settings): void {
    this.db.prepare("INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data").run(JSON.stringify(settings));
  }
}

/** Key/value storage, one table per sensitivity: `secrets` never leaves the server. */
export class KeyValueRepository {
  private readonly db: Database;
  private readonly table: "secrets" | "app_state";
  private readonly keyColumn: "name" | "key";

  constructor(db: Database, table: "secrets" | "app_state") {
    this.db = db;
    this.table = table;
    this.keyColumn = table === "secrets" ? "name" : "key";
  }

  get(key: string): string | null {
    const row = this.db.prepare<[string], { value: string }>(`SELECT value FROM ${this.table} WHERE ${this.keyColumn} = ?`).get(key);
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(`INSERT INTO ${this.table} (${this.keyColumn}, value) VALUES (?, ?) ON CONFLICT (${this.keyColumn}) DO UPDATE SET value = excluded.value`)
      .run(key, value);
  }

  delete(key: string): void {
    this.db.prepare(`DELETE FROM ${this.table} WHERE ${this.keyColumn} = ?`).run(key);
  }
}

export class ApiUsageRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  increment(day: string, by = 1): number {
    return this.db
      .prepare<[string, number], { calls: number }>(
        "INSERT INTO api_usage (day, calls) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET calls = calls + excluded.calls RETURNING calls",
      )
      .get(day, by)!.calls;
  }

  callsOn(day: string): number {
    return this.db.prepare<[string], { calls: number }>("SELECT calls FROM api_usage WHERE day = ?").get(day)?.calls ?? 0;
  }
}

export interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export class PushSubscriptionRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  list(): StoredPushSubscription[] {
    return this.db.prepare<[], StoredPushSubscription>("SELECT endpoint, p256dh, auth FROM push_subscriptions").all();
  }

  upsert(subscription: StoredPushSubscription, userAgent: string | null, now: string): void {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
      )
      .run(subscription.endpoint, subscription.p256dh, subscription.auth, userAgent, now);
  }

  delete(endpoint: string): void {
    this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  }
}

/** Expiring cache for slow-changing marketplace data (eBay taxonomy, condition lists). */
export class CacheRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  get<T>(key: string, now: string): T | null {
    const row = this.db.prepare<[string, string], { value: string }>("SELECT value FROM cache WHERE key = ? AND expires_at > ?").get(key, now);
    return row ? fromJson<T>(row.value) : null;
  }

  set(key: string, value: unknown, expiresAt: string): void {
    this.db
      .prepare("INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at")
      .run(key, JSON.stringify(value), expiresAt);
  }
}
