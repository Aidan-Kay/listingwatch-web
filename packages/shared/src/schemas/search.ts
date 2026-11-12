import { z } from "zod";
import { EBAY_ITEM_LOCATIONS, EBAY_SITE_CODES, SOURCES, VINTED_SITE_CODES } from "../marketplaces/index.ts";

export const MIN_POLL_INTERVAL_SECONDS = 30;
export const MAX_POLL_INTERVAL_SECONDS = 24 * 60 * 60;

const price = z.number().nonnegative().max(1_000_000_000);
export const pollInterval = z.number().int().min(MIN_POLL_INTERVAL_SECONDS).max(MAX_POLL_INTERVAL_SECONDS);
export const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Must be a colour like #5865f2");
const categoryId = z.string().trim().regex(/^\d+$/, "Category IDs are numbers");

/** One facet: eBay aspect ("Platform": ["Sony PlayStation 2"]) or Vinted attribute ("video_game_platform": ["1281"]). */
export const filterRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  values: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
});
export type FilterRow = z.infer<typeof filterRowSchema>;

const commonFields = {
  name: z.string().trim().min(1, "Give the search a name").max(120),
  keywords: z.string().trim().max(500).default(""),
  minPrice: price.nullable().default(null),
  maxPrice: price.nullable().default(null),
  /** Dropped when the title contains any of these (case-insensitive substring). */
  excludeKeywords: z
    .array(z.string().trim().toLowerCase().min(1).max(200))
    .max(500)
    .default([])
    .transform((words) => [...new Set(words)]),
  /** Match lists; when any are attached, only titles matching a term are kept. */
  includeListIds: z.array(z.string().min(1)).max(50).default([]),
  enabled: z.boolean().default(true),
  notify: z.boolean().default(true),
  /** No notification above this price (the listing still reaches the feed). */
  maxNotifyPrice: price.nullable().default(null),
  color: hexColor.nullable().default(null),
  minInterval: pollInterval.nullable().default(null),
  maxInterval: pollInterval.nullable().default(null),
  category: categoryId.nullable().default(null),
  conditions: z.array(z.string().trim().min(1)).max(20).default([]),
  filters: z.array(filterRowSchema).max(50).default([]),
};

export const EBAY_FORMATS = ["all", "auction", "buy_now"] as const;
export type EbayFormat = (typeof EBAY_FORMATS)[number];

const ebaySearchInput = z.object({
  ...commonFields,
  source: z.literal("ebay"),
  site: z.enum(EBAY_SITE_CODES),
  format: z.enum(EBAY_FORMATS).default("all"),
  itemLocation: z.enum(EBAY_ITEM_LOCATIONS).nullable().default(null),
});

const vintedSearchInput = z.object({
  ...commonFields,
  source: z.literal("vinted"),
  site: z.enum(VINTED_SITE_CODES),
});

/** What a client sends to create or replace a search. */
export const searchInputSchema = z.discriminatedUnion("source", [ebaySearchInput, vintedSearchInput]).superRefine((search, ctx) => {
  if (search.minPrice !== null && search.maxPrice !== null && search.minPrice > search.maxPrice) {
    ctx.addIssue({ code: "custom", path: ["maxPrice"], message: "Max price is below min price" });
  }
  if (search.minInterval !== null && search.maxInterval !== null && search.minInterval > search.maxInterval) {
    ctx.addIssue({ code: "custom", path: ["maxInterval"], message: "Maximum interval is below the minimum" });
  }
});
export type SearchInput = z.infer<typeof searchInputSchema>;
export type EbaySearchInput = z.infer<typeof ebaySearchInput>;
export type VintedSearchInput = z.infer<typeof vintedSearchInput>;

export const sourceSchema = z.enum(SOURCES);

/** Why a search's last poll failed. The kind drives retries, backoff and the advice shown. */
export const ERROR_KINDS = ["config", "auth", "quota", "rate-limit", "blocked", "challenge", "offline", "upstream", "bad-response", "unknown"] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

export const searchErrorSchema = z.object({
  kind: z.enum(ERROR_KINDS),
  message: z.string(),
  at: z.iso.datetime(),
});
export type SearchError = z.infer<typeof searchErrorSchema>;

export const searchStatusSchema = z.object({
  lastPolledAt: z.iso.datetime().nullable(),
  lastError: searchErrorSchema.nullable(),
  consecutiveErrors: z.number().int().nonnegative(),
  /** False until the first successful poll has recorded what's already listed. */
  baselineDone: z.boolean(),
  lastNewCount: z.number().int().nonnegative(),
});
export type SearchStatus = z.infer<typeof searchStatusSchema>;

const searchMeta = {
  id: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  status: searchStatusSchema,
};

export const searchSchema = z.discriminatedUnion("source", [ebaySearchInput.extend(searchMeta), vintedSearchInput.extend(searchMeta)]);
export type Search = z.infer<typeof searchSchema>;

/** The configuration part of a search, without identity or status. */
export function searchConfigOf(search: Search): SearchInput {
  const { id: _id, createdAt: _created, updatedAt: _updated, status: _status, ...config } = search;
  return config;
}
