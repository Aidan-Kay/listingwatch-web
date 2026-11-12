import { z } from "zod";
import type { FoundListing, Listing } from "./listing.ts";
import type { SearchStatus } from "./search.ts";

/** Every non-2xx response body. `issues` lists field-level validation problems. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
  };
}

export interface FeedResponse {
  listings: Listing[];
  /** When the feed was last viewed on any device; newer listings count as unseen. */
  seenAt: string | null;
}

export interface PollingState {
  paused: boolean;
}

export interface EbayCategory {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
  leaf: boolean;
}

export interface CategoryConditions {
  conditions: { id: string; label: string }[];
  /** False when eBay had no list for the category and the site-wide list is shown. */
  categorySpecific: boolean;
}

export interface ApiUsage {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  calls: number;
  limit: number;
  /** Calls a day the enabled eBay searches make at their average interval. */
  projectedDaily: number;
}

export interface TestedListing extends FoundListing {
  matchedTerms: string[];
}

/** The result of running a search once without saving it. */
export interface TestSearchResult {
  /** Listings that pass every filter, newest first. */
  kept: TestedListing[];
  /** Listings the match lists rejected. */
  rejectedByMatchLists: FoundListing[];
  /** Listings the exclude keywords rejected. */
  rejectedByExcludes: FoundListing[];
}

export interface ProxyTestResult {
  ok: boolean;
  ip?: string;
  error?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
}

export interface ImportResult {
  searches: number;
  matchLists: number;
  favourites: number;
  settingsImported: boolean;
}

/** Server → browser events on `GET /api/events`. */
export type LiveEvent =
  | { type: "listings.added"; listings: Listing[]; notifiable: string[] }
  | { type: "listings.merged"; key: string; searchIds: string[] }
  | { type: "listings.removed"; keys: string[] }
  | { type: "feed.cleared" }
  | { type: "feed.seen"; seenAt: string }
  | { type: "search.status"; searchId: string; status: SearchStatus }
  | { type: "searches.changed" }
  | { type: "lists.changed" }
  | { type: "favourites.changed" }
  | { type: "settings.changed" }
  | { type: "polling.state"; paused: boolean }
  | { type: "usage.changed"; day: string; calls: number };

export type LiveEventType = LiveEvent["type"];

export const presenceSchema = z.object({
  clientId: z.string().min(8).max(64),
  visible: z.boolean(),
});
export type Presence = z.infer<typeof presenceSchema>;

export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
