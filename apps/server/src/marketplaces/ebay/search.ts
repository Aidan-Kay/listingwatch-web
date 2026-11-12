import { ebaySite, toEbayConditionIds, type BuyingFormat, type EbaySite } from "@listingwatch/shared/marketplaces";
import type { EbaySearchInput, FoundListing, Money } from "@listingwatch/shared/schemas";

export const BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
export const SEARCH_PAGE_SIZE = 50;

/** The Browse API search URL for a saved search: newest first, every marketplace-side filter applied. */
export function buildSearchUrl(search: EbaySearchInput): string {
  const site = siteOf(search.site);
  const params = new URLSearchParams();
  if (search.keywords) params.set("q", search.keywords);
  if (search.category) params.set("category_ids", search.category);
  params.set("sort", "newlyListed");
  params.set("limit", String(SEARCH_PAGE_SIZE));
  params.set("filter", buildFilter(search, site.currency).join(","));
  const aspects = search.category ? buildAspectFilter(search) : null;
  if (aspects) params.set("aspect_filter", aspects);
  return `${BROWSE_SEARCH_URL}?${params}`;
}

function buildFilter(search: EbaySearchInput, currency: string): string[] {
  const filters: string[] = [];
  if (search.minPrice !== null || search.maxPrice !== null) {
    filters.push(`price:[${search.minPrice ?? ""}..${search.maxPrice ?? ""}]`, `priceCurrency:${currency}`);
  }
  const options = { all: "AUCTION|FIXED_PRICE|BEST_OFFER", auction: "AUCTION", buy_now: "FIXED_PRICE" }[search.format];
  filters.push(`buyingOptions:{${options}}`);
  if (search.itemLocation) filters.push(`itemLocationCountry:${search.itemLocation}`);
  const conditionIds = toEbayConditionIds(search.conditions);
  if (conditionIds.length > 0) filters.push(`conditionIds:{${conditionIds.join("|")}}`);
  return filters;
}

/** `categoryId:123,Platform:{Sony PlayStation 2|Microsoft Xbox}` — only valid alongside a category. */
function buildAspectFilter(search: EbaySearchInput): string | null {
  if (search.filters.length === 0) return null;
  const aspects = search.filters.map((row) => `${row.name}:{${row.values.join("|")}}`);
  return [`categoryId:${search.category}`, ...aspects].join(",");
}

/** The parts of a Browse API item summary this app reads. */
export interface EbayItemSummary {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  price?: EbayAmount;
  currentBidPrice?: EbayAmount;
  shippingOptions?: { shippingCost?: EbayAmount }[];
  condition?: string;
  image?: { imageUrl?: string };
  additionalImages?: { imageUrl?: string }[];
  buyingOptions?: string[];
  bidCount?: number;
  itemCreationDate?: string;
  itemEndDate?: string;
}

interface EbayAmount {
  value?: string;
  currency?: string;
}

/** Map one item summary, or null when it lacks the essentials. */
export function mapItemSummary(item: EbayItemSummary, siteCode: string, now: Date): FoundListing | null {
  const itemId = numericItemId(item.itemId);
  if (itemId === null || !item.title) return null;
  const site = siteOf(siteCode);
  const bid = toMoney(item.currentBidPrice);
  const imageUrls = collectImages(item);
  return {
    source: "ebay",
    itemId,
    site: site.code,
    title: item.title,
    url: item.itemWebUrl ?? `${site.origin}/itm/${itemId}`,
    price: bid ?? toMoney(item.price),
    priceIsBid: bid !== null,
    shipping: toMoney(item.shippingOptions?.[0]?.shippingCost),
    condition: item.condition ?? null,
    brand: null,
    imageUrl: item.image?.imageUrl ? resizeImage(item.image.imageUrl, 400) : null,
    imageUrls,
    buyingFormats: buyingFormats(item.buyingOptions ?? []),
    bidCount: item.bidCount ?? 0,
    listedAt: validDate(item.itemCreationDate) ?? now.toISOString(),
    listedAtEstimated: validDate(item.itemCreationDate) === null,
    endsAt: validDate(item.itemEndDate),
  };
}

/** Browse API IDs look like `v1|123456789|0`; the middle part is the listing number. */
export function numericItemId(raw: string | undefined): string | null {
  const id = raw?.split("|")[1] ?? raw;
  return id && /^\d+$/.test(id) ? id : null;
}

/** eBay image URLs carry their size as `s-lNNN`; ask for another. */
export function resizeImage(url: string, size: number): string {
  return url.replace(/s-l\d+/, `s-l${size}`);
}

function collectImages(item: EbayItemSummary): string[] {
  const urls = [item.image?.imageUrl, ...(item.additionalImages ?? []).map((image) => image.imageUrl)];
  return [...new Set(urls.filter((url): url is string => typeof url === "string").map((url) => resizeImage(url, 1600)))];
}

function buyingFormats(options: readonly string[]): BuyingFormat[] {
  const formats: BuyingFormat[] = [];
  if (options.includes("AUCTION")) formats.push("Auction");
  if (options.includes("FIXED_PRICE")) formats.push("Buy It Now");
  if (options.includes("BEST_OFFER")) formats.push("Best Offer");
  return formats.length > 0 ? formats : ["Other"];
}

function toMoney(amount: EbayAmount | undefined): Money | null {
  const value = Number(amount?.value);
  return amount?.currency && Number.isFinite(value) ? { amount: value, currency: amount.currency } : null;
}

function validDate(value: string | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function siteOf(code: string): EbaySite {
  const site = ebaySite(code);
  if (!site) throw new Error(`Unknown eBay site ${code}`);
  return site;
}
