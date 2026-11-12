import type { Listing } from "@listingwatch/shared/schemas";
import { describe, expect, it } from "vitest";
import { activeFilterCount, applyListingFilters, DEFAULT_FILTERS, freshness, FRESHNESS_WINDOW_MS, isListingFilters } from "./listing-filters";

const NOW = Date.parse("2026-11-11T12:00:00.000Z");

function listing(key: string, overrides: Partial<Listing> = {}): Listing {
  return {
    key,
    source: "ebay",
    itemId: key,
    site: "UK",
    title: `Item ${key}`,
    url: "https://www.ebay.co.uk/itm/1",
    price: { amount: 10, currency: "GBP" },
    priceIsBid: false,
    shipping: null,
    condition: null,
    brand: null,
    imageUrl: null,
    imageUrls: [],
    buyingFormats: ["Buy It Now"],
    bidCount: 0,
    listedAt: "2026-11-11T11:00:00.000Z",
    listedAtEstimated: false,
    endsAt: null,
    searchIds: ["s1"],
    matchedTerms: [],
    foundAt: "2026-11-11T11:00:00.000Z",
    ...overrides,
  };
}

describe("applyListingFilters", () => {
  const listings = [
    listing("a", { title: "Zelda Ocarina", price: { amount: 30, currency: "GBP" }, listedAt: "2026-11-11T10:00:00.000Z" }),
    listing("b", { title: "Mario Kart", source: "vinted", price: null, listedAt: "2026-11-11T11:30:00.000Z" }),
    listing("c", { title: "Zelda Wind Waker", buyingFormats: ["Auction"], searchIds: ["s2"], price: { amount: 5, currency: "GBP" }, listedAt: "2026-11-11T11:00:00.000Z" }),
  ];
  const keys = (filters: Partial<typeof DEFAULT_FILTERS>): string[] => applyListingFilters(listings, { ...DEFAULT_FILTERS, ...filters }).map((l) => l.key);

  it("sorts by listing time, newest first by default", () => {
    expect(keys({})).toEqual(["b", "c", "a"]);
    expect(keys({ sort: "oldest" })).toEqual(["a", "c", "b"]);
  });

  it("sorts by price with unknown prices last either way", () => {
    expect(keys({ sort: "price-asc" })).toEqual(["c", "a", "b"]);
    expect(keys({ sort: "price-desc" })).toEqual(["a", "c", "b"]);
  });

  it("filters by every word of the text, marketplace, search and format", () => {
    expect(keys({ text: "zelda waker" })).toEqual(["c"]);
    expect(keys({ source: "vinted" })).toEqual(["b"]);
    expect(keys({ searchId: "s2" })).toEqual(["c"]);
    expect(keys({ format: "Auction" })).toEqual(["c"]);
  });

  it("counts active filters, ignoring sort", () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, sort: "oldest" })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, text: " x ", source: "ebay" })).toBe(2);
  });

  it("recognises stored filters and rejects junk", () => {
    expect(isListingFilters(DEFAULT_FILTERS)).toBe(true);
    expect(isListingFilters({ ...DEFAULT_FILTERS, sort: "random" })).toBe(false);
    expect(isListingFilters(null)).toBe(false);
  });
});

describe("freshness", () => {
  it("starts hot and cools quadratically to zero over the window", () => {
    expect(freshness(listing("a", { listedAt: new Date(NOW).toISOString() }), NOW)).toBe(1);
    expect(freshness(listing("a", { listedAt: new Date(NOW - FRESHNESS_WINDOW_MS / 2).toISOString() }), NOW)).toBeCloseTo(0.25);
    expect(freshness(listing("a", { listedAt: new Date(NOW - FRESHNESS_WINDOW_MS).toISOString() }), NOW)).toBe(0);
  });

  it("is zero for ended auctions", () => {
    expect(freshness(listing("a", { listedAt: new Date(NOW).toISOString(), endsAt: new Date(NOW - 1).toISOString() }), NOW)).toBe(0);
  });
});
