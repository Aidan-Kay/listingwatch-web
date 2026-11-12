import type { Listing, Money, Search, Settings } from "@listingwatch/shared/schemas";

export interface NotificationContent {
  title: string;
  body: string;
  /** Listing keys, so opening the notification can scroll to them. */
  keys: string[];
}

/**
 * The new listings worth a notification: from a search with notifications on,
 * in a buying format the user wants, and not above the search's price ceiling
 * (when either price is unknown, it's allowed through).
 */
export function selectNotifiable(listings: readonly Listing[], searches: ReadonlyMap<string, Search>, settings: Settings): Listing[] {
  const formats = new Set<string>(settings.notifyFormats);
  return listings.filter((listing) => {
    const search = searches.get(listing.searchIds[0] ?? "");
    if (!search?.notify) return false;
    if (!listing.buyingFormats.some((format) => formats.has(format))) return false;
    return search.maxNotifyPrice === null || listing.price === null || listing.price.amount <= search.maxNotifyPrice;
  });
}

/** One listing: "<search>" / "<title> · <price>". Several: a count and the first three titles. */
export function buildNotification(listings: readonly Listing[], searches: ReadonlyMap<string, Search>): NotificationContent | null {
  const [first] = listings;
  if (first === undefined) return null;
  const keys = listings.map((l) => l.key);
  if (listings.length === 1) {
    const searchName = searches.get(first.searchIds[0] ?? "")?.name ?? "New listing";
    const price = first.price ? ` · ${formatMoney(first.price)}` : "";
    return { title: searchName, body: `${first.title}${price}`, keys };
  }
  const shown = listings.slice(0, 3).map((l) => `• ${l.title}`);
  const more = listings.length > 3 ? [`…and ${listings.length - 3} more`] : [];
  return { title: `${listings.length} new listings`, body: [...shown, ...more].join("\n"), keys };
}

export function formatMoney(money: Money): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: money.currency }).format(money.amount);
  } catch {
    return `${money.amount.toFixed(2)} ${money.currency}`;
  }
}
