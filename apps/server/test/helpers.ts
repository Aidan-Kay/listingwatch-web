import type { FoundListing, SearchInput } from "@listingwatch/shared/schemas";
import { searchInputSchema } from "@listingwatch/shared/schemas";
import { pino } from "pino";

export const silentLog = pino({ level: "silent" });

export function foundListing(overrides: Partial<FoundListing> & { itemId: string }): FoundListing {
  return {
    source: "ebay",
    site: "UK",
    title: `Listing ${overrides.itemId}`,
    url: `https://www.ebay.co.uk/itm/${overrides.itemId}`,
    price: { amount: 10, currency: "GBP" },
    priceIsBid: false,
    shipping: null,
    condition: null,
    brand: null,
    imageUrl: null,
    imageUrls: [],
    buyingFormats: ["Buy It Now"],
    bidCount: 0,
    listedAt: "2026-11-11T12:00:00.000Z",
    listedAtEstimated: false,
    endsAt: null,
    ...overrides,
  };
}

export function ebaySearch(overrides: Partial<Record<string, unknown>> = {}): SearchInput {
  return searchInputSchema.parse({ source: "ebay", site: "UK", name: "Switch", keywords: "nintendo switch", ...overrides });
}

export function vintedSearch(overrides: Partial<Record<string, unknown>> = {}): SearchInput {
  return searchInputSchema.parse({ source: "vinted", site: "UK", name: "Gamecube", keywords: "gamecube", ...overrides });
}
