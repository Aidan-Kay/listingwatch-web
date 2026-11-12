/**
 * Conversions from the Electron app's data (backup files v1/v2, and its
 * userData JSON files) to this app's shapes. Everything is parsed defensively:
 * these files were written by older code and may have been hand-edited.
 */
import { EBAY_SITE_CODES, toEbayConditionIds, toVintedConditionIds, VINTED_SITE_CODES } from "@listingwatch/shared/marketplaces";
import {
  matchListInputSchema,
  searchInputSchema,
  settingsSchema,
  type FilterRow,
  type Listing,
  type MatchList,
  type SearchInput,
  type Settings,
} from "@listingwatch/shared/schemas";

type Json = Record<string, unknown>;

export interface ConvertedSearch {
  id: string;
  config: SearchInput;
}

/** Convert one Electron search, or explain why it can't be. */
export function convertElectronSearch(raw: unknown): ConvertedSearch | { error: string } {
  if (!isObject(raw) || typeof raw.id !== "string") return { error: "a search without an id" };
  const isEbay = raw.source === "ebay";
  const candidate = {
    source: raw.source,
    site: raw.site ?? (isEbay ? EBAY_SITE_CODES[0] : VINTED_SITE_CODES[0]),
    name: raw.name,
    keywords: str(raw.keywords),
    minPrice: num(raw.minPrice),
    maxPrice: num(raw.maxPrice),
    excludeKeywords: strings(raw.excludeKeywords),
    includeListIds: strings(raw.includeLists),
    enabled: raw.enabled !== false,
    notify: raw.notify !== false,
    maxNotifyPrice: num(raw.maxNotifyPrice),
    color: typeof raw.cardColor === "string" && /^#[0-9a-f]{6}$/i.test(raw.cardColor) ? raw.cardColor : null,
    minInterval: num(raw.minInterval),
    maxInterval: num(raw.maxInterval),
    ...(isEbay
      ? {
          category: idOrNull(raw.category),
          conditions: toEbayConditionIds(strings(raw.conditions)),
          format: ["all", "auction", "buy_now"].includes(String(raw.format)) ? raw.format : "all",
          itemLocation: str(raw.itemLocation).toUpperCase() || null,
          filters: filterRows(raw.aspectFilters),
        }
      : {
          category: idOrNull(raw.vintedCategory),
          conditions: toVintedConditionIds(strings(raw.vintedConditions)),
          filters: filterRows(raw.vintedFilters),
        }),
  };
  const parsed = searchInputSchema.safeParse(candidate);
  if (!parsed.success) return { error: `"${str(raw.name) || raw.id}": ${parsed.error.issues[0]?.message ?? "invalid"}` };
  return { id: raw.id, config: parsed.data };
}

export function convertElectronMatchList(raw: unknown, now: string): MatchList | null {
  if (!isObject(raw) || typeof raw.id !== "string") return null;
  const parsed = matchListInputSchema.safeParse({ name: raw.name, terms: raw.terms });
  if (!parsed.success) return null;
  const version = typeof raw.version === "number" && raw.version > 0 ? Math.floor(raw.version) : 1;
  return { id: raw.id, ...parsed.data, version, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now };
}

/** The Electron app's default accent; a backup carrying it never chose a colour, so the current one is kept. */
const ELECTRON_DEFAULT_ACCENT = "#7d8efc";

/** Electron settings, minus credentials (encrypted with the old machine's keychain, so unusable). */
export function convertElectronSettings(raw: unknown, current: Settings): Settings {
  if (!isObject(raw)) return current;
  const candidate = {
    ...current,
    minInterval: num(raw.minInterval) ?? current.minInterval,
    maxInterval: num(raw.maxInterval) ?? current.maxInterval,
    backfillHours: num(raw.showListingsFromHours) ?? current.backfillHours,
    notifyFormats: Array.isArray(raw.notifyFormats) ? raw.notifyFormats : current.notifyFormats,
    notifyWhenFocused: typeof raw.notifyWhenFocused === "boolean" ? raw.notifyWhenFocused : current.notifyWhenFocused,
    sound: {
      ...current.sound,
      enabled: typeof raw.notificationSoundEnabled === "boolean" ? raw.notificationSoundEnabled : current.sound.enabled,
      volume: num(raw.notificationVolume) ?? current.sound.volume,
    },
    accentColor: typeof raw.accentColor === "string" && raw.accentColor.toLowerCase() !== ELECTRON_DEFAULT_ACCENT ? raw.accentColor : current.accentColor,
    proxy: { enabled: raw.proxyEnabled === true, url: str(raw.proxyUrl) },
    ebayDailyLimit: num(raw.ebayApiDailyLimit) ?? current.ebayDailyLimit,
  };
  const parsed = settingsSchema.safeParse(candidate);
  return parsed.success ? parsed.data : current;
}

/** Convert an Electron favourite (a feed-card snapshot) to a listing. */
export function convertElectronFavourite(raw: unknown): { listing: Listing; savedAt: string } | null {
  if (!isObject(raw) || (raw.source !== "ebay" && raw.source !== "vinted") || typeof raw.itemId !== "string" || typeof raw.url !== "string") return null;
  const currency = currencyFromPriceText(str(raw.price), str(raw.site), raw.source);
  const foundAt = isoOr(raw.foundAt, new Date(0).toISOString());
  const listing: Listing = {
    key: `${raw.source}:${raw.itemId}`,
    source: raw.source,
    itemId: raw.itemId,
    site: str(raw.site),
    title: str(raw.title) || "(untitled)",
    url: raw.url,
    price: typeof raw.priceNumeric === "number" && currency ? { amount: raw.priceNumeric, currency } : null,
    priceIsBid: str(raw.price).startsWith("Bid"),
    shipping: null,
    condition: typeof raw.condition === "string" ? raw.condition : null,
    brand: null,
    imageUrl: typeof raw.image === "string" ? raw.image : null,
    imageUrls: strings(raw.images),
    buyingFormats: strings(raw.buyingFormats).filter((f) => ["Auction", "Buy It Now", "Best Offer", "Other"].includes(f)) as Listing["buyingFormats"],
    bidCount: num(raw.bidCount) ?? 0,
    listedAt: isoOr(raw.listingDate, foundAt),
    listedAtEstimated: raw.listingDateEstimated === true || typeof raw.listingDate !== "string",
    endsAt: typeof raw.listingEndDate === "string" ? isoOr(raw.listingEndDate, null) : null,
    searchIds: strings(raw.searchIds).length > 0 ? strings(raw.searchIds) : [str(raw.searchId) || "imported"],
    matchedTerms: strings(raw.matchedTerms),
    foundAt,
  };
  return { listing, savedAt: foundAt };
}

const SITE_CURRENCIES: Record<string, string> = { US: "USD", UK: "GBP", AU: "AUD", CA: "CAD", PL: "PLN" };

function currencyFromPriceText(price: string, site: string, source: string): string | null {
  if (price.includes("£")) return "GBP";
  if (price.includes("€")) return "EUR";
  if (price.includes("zł")) return "PLN";
  if (price.includes("A$")) return "AUD";
  if (price.includes("C$")) return "CAD";
  if (price.includes("$")) return "USD";
  return SITE_CURRENCIES[site] ?? (source === "vinted" || site !== "" ? "EUR" : null);
}

/** Aspect rows had comma-joined or array values; Vinted rows had comma-joined strings. */
function filterRows(raw: unknown): FilterRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!isObject(row) || typeof row.name !== "string" || row.name.trim() === "") return [];
    const values = (Array.isArray(row.values) ? row.values.map(String) : str(row.values).split(","))
      .map((v) => v.trim())
      .filter((v) => v !== "");
    return values.length > 0 ? [{ name: row.name.trim(), values }] : [];
  });
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function idOrNull(value: unknown): string | null {
  const id = str(value);
  return /^\d+$/.test(id) ? id : null;
}

function isoOr<T extends string | null>(value: unknown, fallback: T): string | T {
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
}
