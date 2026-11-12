import type { CompiledList } from "@listingwatch/shared/keyword-match";
import { listingKey, type FoundListing, type Listing } from "@listingwatch/shared/schemas";
import { applyClientFilters } from "./client-filters.ts";

export interface PollInput {
  searchId: string;
  excludeKeywords: readonly string[];
  /** False on a search's first poll, or after its client-side filters changed. */
  baselineDone: boolean;
  found: readonly FoundListing[];
  lists: readonly CompiledList[];
  /** Item IDs this search has fetched before. */
  seenIds: ReadonlySet<string>;
  /** For found listings already on the feed: the searches they're tagged with. */
  onFeed: ReadonlyMap<string, readonly string[]>;
  backfillHours: number;
  now: Date;
}

export interface PollPlan {
  /** Every fetched item ID, filtered or not, so a filter change can't re-announce them. */
  seen: string[];
  /** New feed listings, newest first. */
  added: Listing[];
  /** Listings already on the feed (from another search) that this search found too. */
  merged: { key: string; searchIds: string[] }[];
  /** Item IDs the user has now been shown via this search. */
  delivered: string[];
  /** Whether this was a baseline poll (nothing is notified). */
  baseline: boolean;
  /** How many listings passed the client-side filters, for logging. */
  keptCount: number;
}

/**
 * Decide what one poll's results mean. Pure: the poller applies the plan to
 * storage in one transaction.
 *
 * A listing is new when it passes the filters and this search hasn't seen it
 * before. A baseline poll records everything as seen and only surfaces
 * listings posted within the backfill window (never ones whose posting time
 * is a guess). A listing another search already put on the feed gains this
 * search's tag instead of a second card.
 */
export function planPoll(input: PollInput): PollPlan {
  const found = uniqueByItemId(input.found);
  const { kept } = applyClientFilters(found, input.lists, input.excludeKeywords);
  const fresh = kept.filter((listing) => !input.seenIds.has(listing.itemId));
  const candidates = input.baselineDone ? fresh : fresh.filter((listing) => isRecent(listing, input.backfillHours, input.now));

  const plan: PollPlan = { seen: found.map((l) => l.itemId), added: [], merged: [], delivered: [], baseline: !input.baselineDone, keptCount: kept.length };
  const foundAt = input.now.toISOString();
  for (const listing of candidates) {
    const key = listingKey(listing);
    const existingTags = input.onFeed.get(key);
    plan.delivered.push(listing.itemId);
    if (existingTags === undefined) {
      plan.added.push({ ...listing, key, searchIds: [input.searchId], foundAt });
    } else if (!existingTags.includes(input.searchId)) {
      plan.merged.push({ key, searchIds: [...existingTags, input.searchId] });
    }
  }
  return plan;
}

function isRecent(listing: FoundListing, hours: number, now: Date): boolean {
  if (hours <= 0 || listing.listedAtEstimated) return false;
  return Date.parse(listing.listedAt) >= now.getTime() - hours * 3_600_000;
}

function uniqueByItemId(listings: readonly FoundListing[]): FoundListing[] {
  const seen = new Set<string>();
  return listings.filter((listing) => {
    if (seen.has(listing.itemId)) return false;
    seen.add(listing.itemId);
    return true;
  });
}
