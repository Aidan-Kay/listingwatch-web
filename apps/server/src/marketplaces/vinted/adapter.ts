import type { FoundListing, SearchInput } from "@listingwatch/shared/schemas";
import type { Logger } from "../../logger.ts";
import { MarketplaceError } from "../errors.ts";
import type { MarketplaceAdapter } from "../types.ts";
import type { VintedBrowser } from "./browser.ts";
import { buildCatalogueUrl, mapCatalogueItem, siteOf, type CatalogueItem } from "./catalogue.ts";
import { VintedSiteSession } from "./site-session.ts";

export class VintedAdapter implements MarketplaceAdapter {
  readonly source = "vinted" as const;
  private readonly browser: VintedBrowser;
  private readonly log: Logger;
  private readonly now: () => Date;
  private readonly sessions = new Map<string, VintedSiteSession>();

  constructor(browser: VintedBrowser, log: Logger, now: () => Date) {
    this.browser = browser;
    this.log = log;
    this.now = now;
  }

  async search(search: SearchInput, signal: AbortSignal): Promise<FoundListing[]> {
    if (search.source !== "vinted") throw new Error("VintedAdapter given a non-Vinted search");
    const site = siteOf(search.site);
    const data = (await this.session(site.domain).getJson(buildCatalogueUrl(search), signal)) as { items?: unknown };
    if (!Array.isArray(data.items)) throw new MarketplaceError("bad-response", "Vinted's catalogue response wasn't in the expected shape");
    const now = this.now();
    return (data.items as CatalogueItem[]).map((item) => mapCatalogueItem(item, site.code, now)).filter((l): l is FoundListing => l !== null);
  }

  /**
   * Vinted's item endpoint only serves its mobile apps (it answers browsers
   * with WEB_NOT_SUPPORTED), so the catalogue's photos are all there are.
   */
  async itemImages(): Promise<string[]> {
    return [];
  }

  /** Switch proxy: sessions are dropped because the browser restarts. */
  async useProxy(proxyUrl: string | null): Promise<void> {
    await this.closeSessions();
    await this.browser.useProxy(proxyUrl);
  }

  async close(): Promise<void> {
    await this.closeSessions();
    await this.browser.close();
  }

  private session(domain: string): VintedSiteSession {
    let session = this.sessions.get(domain);
    if (!session) {
      session = new VintedSiteSession(domain, this.browser, this.log);
      this.sessions.set(domain, session);
    }
    return session;
  }

  private async closeSessions(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => s.close()));
    this.sessions.clear();
  }
}
