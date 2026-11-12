import { ebaySite } from "@listingwatch/shared/marketplaces";
import type { FoundListing, SearchInput } from "@listingwatch/shared/schemas";
import type { Logger } from "../../logger.ts";
import { MarketplaceError } from "../errors.ts";
import type { MarketplaceAdapter } from "../types.ts";
import type { EbayClient } from "./client.ts";
import { buildSearchUrl, mapItemSummary, resizeImage, type EbayItemSummary } from "./search.ts";

export class EbayAdapter implements MarketplaceAdapter {
  readonly source = "ebay" as const;
  private readonly client: EbayClient;
  private readonly log: Logger;
  private readonly now: () => Date;

  constructor(client: EbayClient, log: Logger, now: () => Date) {
    this.client = client;
    this.log = log;
    this.now = now;
  }

  async search(search: SearchInput, signal: AbortSignal): Promise<FoundListing[]> {
    if (search.source !== "ebay") throw new Error("EbayAdapter given a non-eBay search");
    const site = ebaySite(search.site)!;
    const data = await this.client.getJson<{ itemSummaries?: EbayItemSummary[] }>(buildSearchUrl(search), { marketplaceId: site.marketplaceId, signal });
    if (data.itemSummaries !== undefined && !Array.isArray(data.itemSummaries)) {
      throw new MarketplaceError("bad-response", "eBay's search response wasn't in the expected shape");
    }
    const now = this.now();
    const items = data.itemSummaries ?? [];
    const listings = items.map((item) => mapItemSummary(item, site.code, now)).filter((l): l is FoundListing => l !== null);
    if (listings.length < items.length) this.log.warn({ search: search.name, skipped: items.length - listings.length }, "Skipped eBay items without an ID or title");
    return listings;
  }

  async itemImages(itemId: string, siteCode: string, signal: AbortSignal): Promise<string[]> {
    const site = ebaySite(siteCode);
    if (!site || !/^\d+$/.test(itemId)) throw new MarketplaceError("config", "Unknown eBay listing");
    const item = await this.client.getJson<EbayItemSummary>(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(`v1|${itemId}|0`)}`, {
      marketplaceId: site.marketplaceId,
      signal,
      attempts: 2,
      timeoutMs: 10_000,
    });
    const urls = [item.image?.imageUrl, ...(item.additionalImages ?? []).map((image) => image.imageUrl)];
    return [...new Set(urls.filter((url): url is string => typeof url === "string").map((url) => resizeImage(url, 1600)))];
  }

  async close(): Promise<void> {}
}
