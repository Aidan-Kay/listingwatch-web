import { z } from "zod";
import { BUYING_FORMATS, SOURCES } from "../marketplaces/index.ts";

export const moneySchema = z.object({
  amount: z.number(),
  currency: z.string().length(3),
});
export type Money = z.infer<typeof moneySchema>;

/** A listing as the marketplace adapters produce it, before it joins the feed. */
export const foundListingSchema = z.object({
  source: z.enum(SOURCES),
  itemId: z.string().min(1),
  site: z.string(),
  title: z.string(),
  url: z.url(),
  price: moneySchema.nullable(),
  /** True when `price` is the current bid of an auction. */
  priceIsBid: z.boolean(),
  /** Null when unknown; an amount of 0 means free. */
  shipping: moneySchema.nullable(),
  condition: z.string().nullable(),
  brand: z.string().nullable(),
  imageUrl: z.url().nullable(),
  imageUrls: z.array(z.url()),
  buyingFormats: z.array(z.enum(BUYING_FORMATS)),
  bidCount: z.number().int().nonnegative(),
  /** When the listing went up. Vinted doesn't say, so it's the time first seen and `listedAtEstimated` is set. */
  listedAt: z.iso.datetime(),
  listedAtEstimated: z.boolean(),
  endsAt: z.iso.datetime().nullable(),
});
export type FoundListing = z.infer<typeof foundListingSchema>;

/** A listing on the feed: one card, possibly found by several searches. */
export const listingSchema = foundListingSchema.extend({
  /** `<source>:<itemId>` — the identity used for cross-search dedup. */
  key: z.string(),
  searchIds: z.array(z.string()).min(1),
  matchedTerms: z.array(z.string()),
  foundAt: z.iso.datetime(),
});
export type Listing = z.infer<typeof listingSchema>;

export function listingKey(listing: Pick<FoundListing, "source" | "itemId">): string {
  return `${listing.source}:${listing.itemId}`;
}

export const favouriteSchema = z.object({
  listing: listingSchema,
  savedAt: z.iso.datetime(),
});
export type Favourite = z.infer<typeof favouriteSchema>;
