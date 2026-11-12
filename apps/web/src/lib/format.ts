import { SOURCE_LABELS, type Source } from "@listingwatch/shared/marketplaces";
import type { Listing, Money } from "@listingwatch/shared/schemas";

const moneyFormats = new Map<string, Intl.NumberFormat>();

export function formatMoney(money: Money): string {
  let format = moneyFormats.get(money.currency);
  if (!format) {
    try {
      format = new Intl.NumberFormat(undefined, { style: "currency", currency: money.currency });
    } catch {
      return `${money.amount.toFixed(2)} ${money.currency}`;
    }
    moneyFormats.set(money.currency, format);
  }
  return format.format(money.amount);
}

export function formatShipping(shipping: Money | null): string | null {
  if (shipping === null) return null;
  return shipping.amount === 0 ? "Free postage" : `+${formatMoney(shipping)} postage`;
}

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "in 3h", "in 2d", or "ended". */
export function timeLeft(iso: string, now: number): string {
  const seconds = (Date.parse(iso) - now) / 1000;
  if (seconds <= 0) return "Ended";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m left`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h left`;
  return `${Math.floor(seconds / 86_400)}d left`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function siteLabel(source: Source, site: string): string {
  return `${SOURCE_LABELS[source]} ${site}`;
}

/** Regional-indicator emoji for a country code ("GB" → 🇬🇧; eBay's "UK" site is GB). */
export function flag(countryCode: string): string {
  const code = countryCode === "UK" ? "GB" : countryCode.toUpperCase();
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const regionNames = new Intl.DisplayNames(undefined, { type: "region" });
export function countryName(code: string): string {
  return regionNames.of(code === "UK" ? "GB" : code) ?? code;
}

/** When the listing went up; for estimated dates, when it was first seen. */
export function listedTime(listing: Listing): number {
  return Date.parse(listing.listedAt);
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? word : pluralWord}`;
}
