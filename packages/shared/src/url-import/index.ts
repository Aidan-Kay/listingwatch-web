/**
 * Turn an eBay or Vinted search-results URL into search settings, so a search
 * can be set up by pasting a link instead of filling in every field.
 */
import {
  EBAY_SITES,
  toEbayConditionIds,
  toVintedConditionIds,
  VINTED_SITES,
  type EbaySiteCode,
  type VintedSiteCode,
} from "../marketplaces/index.ts";
import type { EbayFormat, FilterRow } from "../schemas/search.ts";

interface ImportedCommon {
  name: string;
  keywords: string;
  minPrice: number | null;
  maxPrice: number | null;
  category: string | null;
  conditions: string[];
  filters: FilterRow[];
}

export type ImportedSearch =
  | (ImportedCommon & { source: "ebay"; site: EbaySiteCode; format: EbayFormat; itemLocation: string | null })
  | (ImportedCommon & { source: "vinted"; site: VintedSiteCode });

export type UrlImportResult = { ok: true; search: ImportedSearch } | { ok: false; reason: string };

/** eBay parameters that are search mechanics, not item aspects. */
const EBAY_NON_ASPECT_PARAMS = new Set(["hash", "rt", "mkcid", "mkrid", "campid", "toolid", "customid", "mkevt", "siteid", "ssPageName"]);

/** Vinted parameters handled explicitly, or that aren't filters at all. */
const VINTED_NON_FILTER_PARAMS = new Set(["search_text", "catalog[]", "status_ids[]", "price_from", "price_to", "order", "page", "per_page", "time", "search_id", "currency"]);

/** The country eBay's "domestic only" (`LH_PrefLoc=1`) means on each site. */
const EBAY_HOME_COUNTRY: Record<EbaySiteCode, string> = { US: "US", UK: "GB", AU: "AU", CA: "CA", DE: "DE", FR: "FR", ES: "ES", IT: "IT" };

export function parseSearchUrl(input: string): UrlImportResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: "That isn't a web address" };
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const ebay = EBAY_SITES.find((site) => new URL(site.origin).hostname.replace(/^www\./, "") === host);
  if (ebay) return { ok: true, search: parseEbayUrl(url, ebay.code) };
  const vinted = VINTED_SITES.find((site) => site.domain.replace(/^www\./, "") === host);
  if (vinted) return { ok: true, search: parseVintedUrl(url, vinted.code) };
  return { ok: false, reason: "Paste a search page from eBay or Vinted" };
}

function parseEbayUrl(url: URL, site: EbaySiteCode): ImportedSearch {
  const params = url.searchParams;
  const keywords = (params.get("_nkw") ?? "").trim();
  const category = params.get("_dcat") ?? nonZero(params.get("_sacat")) ?? /\/sch\/(\d+)\//.exec(url.pathname)?.[1] ?? null;
  const format: EbayFormat = params.get("LH_BIN") === "1" ? "buy_now" : params.get("LH_Auction") === "1" ? "auction" : "all";
  return {
    source: "ebay",
    site,
    name: suggestedName(keywords, `eBay ${site}`),
    keywords,
    minPrice: parsePrice(params.get("_udlo")),
    maxPrice: parsePrice(params.get("_udhi")),
    category: category !== null && /^\d+$/.test(category) ? category : null,
    conditions: toEbayConditionIds((params.get("LH_ItemCondition") ?? "").split("|")),
    format,
    itemLocation: params.get("LH_PrefLoc") === "1" ? EBAY_HOME_COUNTRY[site] : null,
    filters: ebayAspects(params),
  };
}

/** Aspect filters: every parameter that isn't eBay's own (`_xxx`, `LH_xxx`), values split on "|". */
function ebayAspects(params: URLSearchParams): FilterRow[] {
  const rows: FilterRow[] = [];
  for (const [rawName, raw] of params) {
    if (rawName.startsWith("_") || rawName.startsWith("LH_") || EBAY_NON_ASPECT_PARAMS.has(rawName)) continue;
    // Aspect names and values are often double-encoded ("Region%2520Code").
    const name = decodeOnce(rawName);
    const values = decodeOnce(raw)
      .split("|")
      .map((value) => value.trim())
      .filter((value) => value !== "" && value !== "!");
    if (values.length > 0) rows.push({ name, values });
  }
  return rows;
}

function parseVintedUrl(url: URL, site: VintedSiteCode): ImportedSearch {
  const params = url.searchParams;
  const keywords = (params.get("search_text") ?? "").trim();
  const [category = null, ...otherCatalogs] = params.getAll("catalog[]").filter((id) => /^\d+$/.test(id));
  const filters = vintedFilters(params);
  // Vinted allows several categories; the first is the search's category and
  // the rest travel as a catalog filter, which the query merges back in.
  if (otherCatalogs.length > 0) filters.unshift({ name: "catalog", values: otherCatalogs });
  return {
    source: "vinted",
    site,
    name: suggestedName(keywords, `Vinted ${site}`),
    keywords,
    minPrice: parsePrice(params.get("price_from")),
    maxPrice: parsePrice(params.get("price_to")),
    category,
    conditions: toVintedConditionIds(params.getAll("status_ids[]")),
    filters,
  };
}

/** Repeated `name[]` parameters collected per attribute, e.g. `video_game_platform_ids[]=1281`. */
function vintedFilters(params: URLSearchParams): FilterRow[] {
  const byName = new Map<string, Set<string>>();
  for (const [key, value] of params) {
    if (VINTED_NON_FILTER_PARAMS.has(key) || !key.endsWith("[]") || value.trim() === "") continue;
    const name = key.slice(0, -2);
    const values = byName.get(name) ?? new Set<string>();
    values.add(value.trim());
    byName.set(name, values);
  }
  return [...byName].map(([name, values]) => ({ name, values: [...values] }));
}

function suggestedName(keywords: string, fallback: string): string {
  return keywords === "" ? fallback : `${keywords} — ${fallback}`;
}

function parsePrice(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function nonZero(value: string | null): string | null {
  return value === null || value === "0" ? null : value;
}

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
