import { toVintedConditionIds, vintedSite, type VintedSite } from "@listingwatch/shared/marketplaces";
import type { FoundListing, VintedSearchInput } from "@listingwatch/shared/schemas";

export const CATALOGUE_PATH = "/svc-catalogue/items";
export const CATALOGUE_PAGE_SIZE = 50;

/**
 * The catalogue API URL for a saved search.
 *
 * The service lives on `api.<domain>`. Facets are `attribute_ids[<name>]` with
 * comma-joined values: repeating a key is rejected with a 400, and unknown
 * parameter names are silently ignored, so a mistake here shows up as wrong
 * results rather than an error. A category, conditions and filter rows for the
 * same attribute merge into one parameter.
 */
export function buildCatalogueUrl(search: VintedSearchInput): string {
  const site = siteOf(search.site);
  const params = new URLSearchParams({ page: "1", per_page: String(CATALOGUE_PAGE_SIZE), order: "newest_first" });
  if (search.keywords) params.set("search_text", search.keywords);
  if (search.minPrice !== null) params.set("price_from", String(search.minPrice));
  if (search.maxPrice !== null) params.set("price_to", String(search.maxPrice));
  for (const [attribute, values] of collectAttributes(search)) {
    params.set(`attribute_ids[${attribute}]`, [...values].join(","));
  }
  return `https://${apiHost(site.domain)}${CATALOGUE_PATH}?${params}`;
}

/** `www.vinted.co.uk` → `api.vinted.co.uk`. */
export function apiHost(domain: string): string {
  return domain.replace(/^www\./, "api.");
}

/**
 * Website URL spelling → attribute name: `video_game_platform_ids[]` →
 * `video_game_platform`. Idempotent.
 */
export function attributeName(name: string): string {
  return name.trim().replace(/\[\]$/, "").replace(/_ids$/, "");
}

function collectAttributes(search: VintedSearchInput): Map<string, Set<string>> {
  const attributes = new Map<string, Set<string>>();
  const add = (name: string, values: readonly string[]): void => {
    const attribute = attributeName(name);
    const bucket = attributes.get(attribute) ?? new Set<string>();
    for (const value of values.flatMap((v) => v.split(","))) {
      if (value.trim() !== "") bucket.add(value.trim());
    }
    if (attribute !== "" && bucket.size > 0) attributes.set(attribute, bucket);
  };
  if (search.category) add("catalog", [search.category]);
  add("status", toVintedConditionIds(search.conditions));
  for (const row of search.filters) add(row.name, row.values);
  return attributes;
}

/** The parts of a catalogue item this app reads. */
export interface CatalogueItem {
  id?: number | string;
  title?: string;
  url?: string;
  price?: { amount?: string | number; currency_code?: string };
  photo?: { url?: string; full_size_url?: string };
  photos?: { url?: string; full_size_url?: string }[];
  /** `first_line` is the brand; `second_line` is the size and/or condition, in the request's locale. */
  item_box?: { first_line?: string; second_line?: string };
}

/**
 * Map one catalogue item, or null when it lacks the essentials. The catalogue
 * reports no listing time, so the time first seen stands in, flagged as an
 * estimate so it's never used to backfill "recent" listings.
 */
export function mapCatalogueItem(item: CatalogueItem, siteCode: string, now: Date): FoundListing | null {
  const site = siteOf(siteCode);
  const itemId = item.id === undefined ? "" : String(item.id);
  if (!/^\d+$/.test(itemId) || !item.title) return null;
  const amount = Number(item.price?.amount);
  const photos = (item.photos ?? []).map((p) => p.full_size_url ?? p.url).filter((url): url is string => typeof url === "string");
  const thumbnail = item.photo?.url ?? item.photo?.full_size_url ?? photos[0] ?? null;
  return {
    source: "vinted",
    itemId,
    site: site.code,
    title: item.title,
    url: absoluteUrl(item.url, site.domain) ?? `https://${site.domain}/items/${itemId}`,
    price: Number.isFinite(amount) && item.price?.currency_code ? { amount, currency: item.price.currency_code } : null,
    priceIsBid: false,
    shipping: null,
    condition: item.item_box?.second_line ?? null,
    brand: brandOf(item),
    imageUrl: thumbnail,
    imageUrls: photos.length > 0 ? photos : thumbnail ? [thumbnail] : [],
    buyingFormats: ["Buy It Now"],
    bidCount: 0,
    listedAt: now.toISOString(),
    listedAtEstimated: true,
    endsAt: null,
  };
}

/** `first_line` is the brand, except for unbranded items, where Vinted repeats the title there. */
function brandOf(item: CatalogueItem): string | null {
  const line = item.item_box?.first_line?.trim();
  return line && line.toLowerCase() !== item.title?.trim().toLowerCase() ? line : null;
}

/** The catalogue returns site-relative item URLs. */
function absoluteUrl(url: string | undefined, domain: string): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${domain}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function siteOf(code: string): VintedSite {
  const site = vintedSite(code);
  if (!site) throw new Error(`Unknown Vinted site ${code}`);
  return site;
}
