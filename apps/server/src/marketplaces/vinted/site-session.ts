import { setTimeout as sleep } from "node:timers/promises";
import type { Page } from "playwright";
import type { Logger } from "../../logger.ts";
import { isAbortError, MarketplaceError } from "../errors.ts";
import type { VintedBrowser } from "./browser.ts";
import { fetchInPage, inspectPage } from "./page-scripts.ts";
import { parseCatalogueResponse } from "./response.ts";

const MAX_ATTEMPTS = 3;
const NAVIGATION_TIMEOUT_MS = 30_000;
const PAGE_CHECK_INTERVAL_MS = 1_000;
/** Lets cookie writes finish after a challenge redirect. */
const SETTLE_DELAY_MS = 2_000;
const FETCH_TIMEOUT_MS = 15_000;
const RETRY_BASE_DELAY_MS = 1_000;

/**
 * One Vinted site (www.vinted.co.uk, www.vinted.fr, …): a page kept on the
 * site's homepage, so API calls made from it are same-site and carry its
 * cookies. Calls are serialised per site; the page has one document.
 */
export class VintedSiteSession {
  private readonly homeUrl: string;
  private readonly browser: VintedBrowser;
  private readonly log: Logger;
  private page: Page | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(domain: string, browser: VintedBrowser, log: Logger) {
    this.homeUrl = `https://${domain}/`;
    this.browser = browser;
    this.log = log.child({ site: domain });
  }

  /** GET JSON from Vinted's API through the page, recovering from challenges and expired sessions. */
  getJson(url: string, signal: AbortSignal): Promise<unknown> {
    const run = this.queue.then(() => this.getJsonNow(url, signal));
    this.queue = run.catch(() => {});
    return run;
  }

  async close(): Promise<void> {
    await this.page?.close().catch(() => {});
    this.page = null;
  }

  private async getJsonNow(url: string, signal: AbortSignal): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      signal.throwIfAborted();
      try {
        const page = await this.ensurePage();
        return parseCatalogueResponse(await page.evaluate(fetchInPage, { url, timeoutMs: FETCH_TIMEOUT_MS }));
      } catch (error) {
        if (isAbortError(error)) throw error;
        const failure = this.classify(error);
        if (attempt >= MAX_ATTEMPTS || !(failure.retryable || failure.kind === "auth")) throw failure;
        this.log.warn({ attempt, kind: failure.kind, message: failure.message }, "Vinted request failed, recovering");
        await this.recover(failure, attempt, signal);
      }
    }
  }

  /** Anything Playwright throws means the page or browser is gone: reopen it. */
  private classify(error: unknown): MarketplaceError {
    if (error instanceof MarketplaceError) return error;
    void this.close();
    const message = error instanceof Error ? error.message.split("\n")[0]! : String(error);
    return new MarketplaceError("upstream", `The Vinted browser failed: ${message}`, { cause: error });
  }

  private async recover(failure: MarketplaceError, attempt: number, signal: AbortSignal): Promise<void> {
    if (failure.kind === "challenge" || failure.kind === "auth") {
      await this.loadHomepage(failure.kind === "challenge" ? "clear a Cloudflare check" : "refresh the session");
      return;
    }
    await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), undefined, { signal });
  }

  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    const page = await this.browser.newPage();
    page.on("crash", () => void page.close().catch(() => {}));
    this.page = page;
    await this.loadHomepage("start a session");
    return page;
  }

  /**
   * Load the homepage and wait until a real page (not a Cloudflare
   * interstitial) is showing. After 30 s it carries on regardless, and the
   * next request decides whether that was good enough.
   */
  private async loadHomepage(reason: string): Promise<void> {
    const page = this.page;
    if (!page || page.isClosed()) return;
    const started = Date.now();
    await page.goto(this.homeUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});
    let challengeSeen = false;
    while (Date.now() - started < NAVIGATION_TIMEOUT_MS) {
      const state = await page.evaluate(inspectPage).catch(() => null);
      if (state && !state.challenge && state.url.startsWith(this.homeUrl) && !state.url.includes("cdn-cgi/")) {
        this.log.info({ reason, ms: Date.now() - started, challengeSeen }, "Vinted homepage loaded");
        await sleep(SETTLE_DELAY_MS);
        return;
      }
      challengeSeen ||= state?.challenge === true;
      await sleep(PAGE_CHECK_INTERVAL_MS);
    }
    this.log.warn({ reason, challengeSeen }, "Vinted homepage didn't settle within 30 s");
  }
}
