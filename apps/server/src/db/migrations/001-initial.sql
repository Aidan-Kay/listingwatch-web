-- Searches: configuration as validated JSON (SearchInput), runtime status as columns.
CREATE TABLE searches (
  id                 TEXT PRIMARY KEY,
  source             TEXT NOT NULL CHECK (source IN ('ebay', 'vinted')),
  config             TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  last_polled_at     TEXT,
  last_error         TEXT,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  baseline_done      INTEGER NOT NULL DEFAULT 0,
  last_new_count     INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE match_lists (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  terms      TEXT NOT NULL,
  version    INTEGER NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- Every item a search has fetched. `delivered` marks the ones the user was shown;
-- re-baselining a search keeps those and forgets the rest.
CREATE TABLE search_items (
  search_id TEXT NOT NULL REFERENCES searches (id) ON DELETE CASCADE,
  item_id   TEXT NOT NULL,
  seen_at   TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (search_id, item_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX search_items_by_age ON search_items (search_id, seen_at);

-- The feed. `id` gives arrival order; `key` is source:itemId for cross-search dedup.
CREATE TABLE listings (
  id            INTEGER PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,
  data          TEXT NOT NULL,
  search_ids    TEXT NOT NULL,
  matched_terms TEXT NOT NULL,
  found_at      TEXT NOT NULL
) STRICT;

CREATE TABLE favourites (
  key      TEXT PRIMARY KEY,
  listing  TEXT NOT NULL,
  saved_at TEXT NOT NULL
) STRICT;

CREATE TABLE settings (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
) STRICT;

-- Values that must never reach the browser (eBay credentials, VAPID private key).
CREATE TABLE secrets (
  name  TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE api_usage (
  day   TEXT PRIMARY KEY,
  calls INTEGER NOT NULL
) STRICT;

CREATE TABLE push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;
