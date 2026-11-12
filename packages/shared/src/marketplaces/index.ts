/**
 * Static facts about the marketplaces: supported sites, their currencies and
 * domains, and the condition vocabularies. One table per fact, used by the
 * server's adapters, the web app's pickers and the URL importer.
 */

export const SOURCES = ["ebay", "vinted"] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<Source, string> = { ebay: "eBay", vinted: "Vinted" };

export interface EbaySite {
  readonly code: string;
  readonly label: string;
  readonly marketplaceId: string;
  readonly currency: string;
  readonly origin: string;
  readonly categoryTreeId: string;
}

export const EBAY_SITES = [
  { code: "UK", label: "United Kingdom", marketplaceId: "EBAY_GB", currency: "GBP", origin: "https://www.ebay.co.uk", categoryTreeId: "3" },
  { code: "US", label: "United States", marketplaceId: "EBAY_US", currency: "USD", origin: "https://www.ebay.com", categoryTreeId: "0" },
  { code: "AU", label: "Australia", marketplaceId: "EBAY_AU", currency: "AUD", origin: "https://www.ebay.com.au", categoryTreeId: "15" },
  { code: "CA", label: "Canada", marketplaceId: "EBAY_CA", currency: "CAD", origin: "https://www.ebay.ca", categoryTreeId: "2" },
  { code: "DE", label: "Germany", marketplaceId: "EBAY_DE", currency: "EUR", origin: "https://www.ebay.de", categoryTreeId: "77" },
  { code: "FR", label: "France", marketplaceId: "EBAY_FR", currency: "EUR", origin: "https://www.ebay.fr", categoryTreeId: "71" },
  { code: "ES", label: "Spain", marketplaceId: "EBAY_ES", currency: "EUR", origin: "https://www.ebay.es", categoryTreeId: "186" },
  { code: "IT", label: "Italy", marketplaceId: "EBAY_IT", currency: "EUR", origin: "https://www.ebay.it", categoryTreeId: "101" },
] as const satisfies readonly EbaySite[];

export type EbaySiteCode = (typeof EBAY_SITES)[number]["code"];
export const EBAY_SITE_CODES = EBAY_SITES.map((s) => s.code) as [EbaySiteCode, ...EbaySiteCode[]];

export interface VintedSite {
  readonly code: string;
  readonly label: string;
  readonly domain: string;
  readonly currency: string;
}

export const VINTED_SITES = [
  { code: "UK", label: "United Kingdom", domain: "www.vinted.co.uk", currency: "GBP" },
  { code: "FR", label: "France", domain: "www.vinted.fr", currency: "EUR" },
  { code: "DE", label: "Germany", domain: "www.vinted.de", currency: "EUR" },
  { code: "BE", label: "Belgium", domain: "www.vinted.be", currency: "EUR" },
  { code: "ES", label: "Spain", domain: "www.vinted.es", currency: "EUR" },
  { code: "IT", label: "Italy", domain: "www.vinted.it", currency: "EUR" },
  { code: "NL", label: "Netherlands", domain: "www.vinted.nl", currency: "EUR" },
  { code: "PL", label: "Poland", domain: "www.vinted.pl", currency: "PLN" },
  { code: "US", label: "United States", domain: "www.vinted.com", currency: "USD" },
] as const satisfies readonly VintedSite[];

export type VintedSiteCode = (typeof VINTED_SITES)[number]["code"];
export const VINTED_SITE_CODES = VINTED_SITES.map((s) => s.code) as [VintedSiteCode, ...VintedSiteCode[]];

export function ebaySite(code: string): EbaySite | undefined {
  return EBAY_SITES.find((site) => site.code === code);
}

export function vintedSite(code: string): VintedSite | undefined {
  return VINTED_SITES.find((site) => site.code === code);
}

export interface ConditionOption {
  readonly id: string;
  readonly label: string;
}

/** eBay's site-wide condition list, used until a category's own list is known. */
export const EBAY_CONDITIONS: readonly ConditionOption[] = [
  { id: "1000", label: "New" },
  { id: "1500", label: "Opened – never used" },
  { id: "1750", label: "New with defects" },
  { id: "2000", label: "Certified – refurbished" },
  { id: "2010", label: "Excellent – refurbished" },
  { id: "2020", label: "Very good – refurbished" },
  { id: "2030", label: "Good – refurbished" },
  { id: "2500", label: "Seller refurbished" },
  { id: "3000", label: "Used" },
  { id: "4000", label: "Very good" },
  { id: "5000", label: "Good" },
  { id: "6000", label: "Acceptable" },
  { id: "7000", label: "For parts or not working" },
];

/** Vinted uses the same six conditions in every category. */
export const VINTED_CONDITIONS: readonly ConditionOption[] = [
  { id: "6", label: "New with tags" },
  { id: "1", label: "New without tags" },
  { id: "2", label: "Very good" },
  { id: "3", label: "Good" },
  { id: "4", label: "Satisfactory" },
  { id: "7", label: "Not fully functional" },
];

/** Legacy eBay condition names and old `LH_ItemCondition` codes, mapped to numeric IDs. */
const EBAY_CONDITION_ALIASES: Readonly<Record<string, string>> = {
  NEW: "1000",
  LIKE_NEW: "1500",
  NEW_OTHER: "1500",
  NEW_WITH_DEFECTS: "1750",
  CERTIFIED_REFURBISHED: "2000",
  EXCELLENT_REFURBISHED: "2010",
  VERY_GOOD_REFURBISHED: "2020",
  GOOD_REFURBISHED: "2030",
  SELLER_REFURBISHED: "2500",
  USED: "3000",
  VERY_GOOD: "4000",
  GOOD: "5000",
  ACCEPTABLE: "6000",
  FOR_PARTS_OR_NOT_WORKING: "7000",
  "1": "1000",
  "3": "3000",
};

/** Normalise eBay condition values (numeric IDs, legacy names or URL codes) to unique numeric IDs. */
export function toEbayConditionIds(values: readonly string[]): string[] {
  const ids = values.map((raw) => {
    const value = raw.trim();
    if (/^\d{4,}$/.test(value)) return value;
    return EBAY_CONDITION_ALIASES[value.toUpperCase()];
  });
  return [...new Set(ids.filter((id): id is string => id !== undefined))];
}

/**
 * Keep only Vinted condition IDs that exist. An unknown status ID makes Vinted
 * return an empty page, so passing one through would silently find nothing.
 */
export function toVintedConditionIds(values: readonly string[]): string[] {
  const known = new Set(VINTED_CONDITIONS.map((c) => c.id));
  return [...new Set(values.map((v) => v.trim()).filter((v) => known.has(v)))];
}

/** Countries offered for eBay's item-location filter (ISO 3166-1 alpha-2). */
export const EBAY_ITEM_LOCATIONS = [
  "US", "GB", "AU", "CA", "DE", "FR", "ES", "IT", "JP", "CN", "HK", "AT", "BE", "CH", "CZ", "DK", "FI", "GR",
  "HR", "HU", "IE", "IL", "NL", "NO", "PL", "PT", "RO", "RU", "SE", "TR", "UA", "ID", "IN", "KR", "MY", "NZ",
  "PH", "SG", "TH", "TW", "VN", "AR", "BR", "MX", "AE", "SA", "ZA",
] as const;

export const BUYING_FORMATS = ["Auction", "Buy It Now", "Best Offer", "Other"] as const;
export type BuyingFormat = (typeof BUYING_FORMATS)[number];

/** The formats a user can choose to be notified about. */
export const NOTIFIABLE_FORMATS = ["Auction", "Buy It Now"] as const;
export type NotifiableFormat = (typeof NOTIFIABLE_FORMATS)[number];
