import type { Source } from "@listingwatch/shared/marketplaces";
import type { FoundListing, SearchInput } from "@listingwatch/shared/schemas";

/**
 * One marketplace. Adding a marketplace means implementing this and
 * registering it; the poller, routes and UI don't branch on the source.
 */
export interface MarketplaceAdapter {
  readonly source: Source;

  /** The newest listings matching the search's marketplace-side filters, newest first. */
  search(search: SearchInput, signal: AbortSignal): Promise<FoundListing[]>;

  /** Every image of one listing, for the lightbox. */
  itemImages(itemId: string, site: string, signal: AbortSignal): Promise<string[]>;

  /** Release browsers, sockets and the like. */
  close(): Promise<void>;
}

export type AdapterRegistry = Readonly<Record<Source, MarketplaceAdapter>>;
