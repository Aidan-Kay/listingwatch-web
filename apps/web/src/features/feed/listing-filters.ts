import type { Listing } from "@listingwatch/shared/schemas";

export const SORT_ORDERS = ["newest", "oldest", "price-asc", "price-desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const SORT_LABELS: Record<SortOrder, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
};

export interface ListingFilters {
  text: string;
  source: "all" | "ebay" | "vinted";
  searchId: string;
  format: "all" | "Auction" | "Buy It Now";
  sort: SortOrder;
}

export const DEFAULT_FILTERS: ListingFilters = { text: "", source: "all", searchId: "all", format: "all", sort: "newest" };

export function isListingFilters(value: unknown): value is ListingFilters {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.text === "string" &&
    ["all", "ebay", "vinted"].includes(String(v.source)) &&
    typeof v.searchId === "string" &&
    ["all", "Auction", "Buy It Now"].includes(String(v.format)) &&
    (SORT_ORDERS as readonly string[]).includes(String(v.sort))
  );
}

/** How many filters (not counting sort) narrow the list. */
export function activeFilterCount(filters: ListingFilters): number {
  return [filters.text.trim() !== "", filters.source !== "all", filters.searchId !== "all", filters.format !== "all"].filter(Boolean).length;
}

/** Filter and sort; time sorts use when the listing went up, not when it was found. */
export function applyListingFilters(listings: readonly Listing[], filters: ListingFilters): Listing[] {
  const words = filters.text.toLowerCase().split(/\s+/).filter(Boolean);
  const kept = listings.filter(
    (l) =>
      (filters.source === "all" || l.source === filters.source) &&
      (filters.searchId === "all" || l.searchIds.includes(filters.searchId)) &&
      (filters.format === "all" || l.buyingFormats.includes(filters.format)) &&
      words.every((word) => l.title.toLowerCase().includes(word)),
  );
  return sortListings(kept, filters.sort);
}

function sortListings(listings: Listing[], order: SortOrder): Listing[] {
  const time = (l: Listing): number => Date.parse(l.listedAt);
  const price = (l: Listing): number => l.price?.amount ?? Number.POSITIVE_INFINITY;
  switch (order) {
    case "newest":
      return listings.sort((a, b) => time(b) - time(a));
    case "oldest":
      return listings.sort((a, b) => time(a) - time(b));
    case "price-asc":
      return listings.sort((a, b) => price(a) - price(b));
    case "price-desc":
      // Unknown prices go last either way.
      return listings.sort((a, b) => (b.price?.amount ?? -1) - (a.price?.amount ?? -1));
  }
}

/** How long a card stays warm after the listing goes up. */
export const FRESHNESS_WINDOW_MS = 60 * 60 * 1000;

/** 0–1: hot when just listed, cooling quadratically to 0 over an hour; 0 once an auction has ended. */
export function freshness(listing: Listing, now: number): number {
  if (listing.endsAt && Date.parse(listing.endsAt) <= now) return 0;
  const age = now - Date.parse(listing.listedAt);
  if (!(age >= 0) || age >= FRESHNESS_WINDOW_MS) return age < 0 ? 1 : 0;
  return (1 - age / FRESHNESS_WINDOW_MS) ** 2;
}
