import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { Logger } from "../../logger.ts";
import { isCloudflareUrl } from "./response.ts";

/** Resource types the pages never need. Cloudflare's challenge assets are always let through. */
const BLOCKED_RESOURCE_TYPES = new Set(["image", "stylesheet", "font", "media"]);

export interface VintedBrowserOptions {
  profileDir: string;
  headless: boolean;
  log: Logger;
}

/**
 * One persistent Chromium profile shared by every Vinted site, launched on
 * first use and relaunched after it closes or crashes. Requests run as real
 * page fetches, which is what gets them past Cloudflare.
 */
export class VintedBrowser {
  private readonly options: VintedBrowserOptions;
  private context: BrowserContext | null = null;
  private launching: Promise<BrowserContext> | null = null;
  private proxyUrl: string | null = null;

  constructor(options: VintedBrowserOptions) {
    this.options = options;
  }

  /** A new page. The tab Chromium opens at launch is closed, since it holds a renderer for nothing. */
  async newPage(): Promise<Page> {
    const context = await this.ensureContext();
    const page = await context.newPage();
    for (const other of context.pages()) {
      if (other !== page && other.url() === "about:blank") await other.close().catch(() => {});
    }
    return page;
  }

  /** Switch proxy. The browser restarts on next use, since Chromium takes its proxy at launch. */
  async useProxy(proxyUrl: string | null): Promise<void> {
    if (proxyUrl === this.proxyUrl) return;
    this.proxyUrl = proxyUrl;
    await this.close();
  }

  async close(): Promise<void> {
    const context = this.context;
    this.context = null;
    await context?.close().catch(() => {});
  }

  private ensureContext(): Promise<BrowserContext> {
    if (this.context) return Promise.resolve(this.context);
    this.launching ??= this.launch().finally(() => {
      this.launching = null;
    });
    return this.launching;
  }

  private async launch(): Promise<BrowserContext> {
    const { profileDir, headless, log } = this.options;
    fs.mkdirSync(profileDir, { recursive: true });
    const context = await chromium.launchPersistentContext(profileDir, {
      headless,
      // Full Chromium in its new headless mode, rather than the headless shell.
      channel: "chromium",
      // Playwright flags the browser as automated by default (an infobar and
      // navigator.webdriver = true); Cloudflare checks the latter.
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled"],
      viewport: { width: 1280, height: 800 },
      userAgent: headless ? headfulUserAgent() : undefined,
      // Service-worker requests bypass routing, so the blocker would miss them.
      serviceWorkers: "block",
      proxy: this.proxyUrl ? proxySettings(this.proxyUrl) : undefined,
    });
    context.on("close", () => {
      if (this.context === context) this.context = null;
      log.info("Vinted browser closed");
    });
    await context.route("**/*", (route) => {
      const request = route.request();
      const blocked = BLOCKED_RESOURCE_TYPES.has(request.resourceType()) && !isCloudflareUrl(request.url());
      return blocked ? route.abort("blockedbyclient") : route.continue();
    });
    this.context = context;
    log.info({ headless, proxy: this.proxyUrl !== null }, "Vinted browser launched");
    return context;
  }
}

let cachedUserAgent: string | null = null;

/**
 * Headless Chromium calls itself "HeadlessChrome" in its user agent, an
 * obvious bot signal. Use what a normal Linux Chrome of the same major version
 * sends (Chrome reports only the major version since UA reduction).
 */
function headfulUserAgent(): string {
  if (cachedUserAgent) return cachedUserAgent;
  const version = execFileSync(chromium.executablePath(), ["--version"], { encoding: "utf8" });
  const major = /(\d+)\.\d+\.\d+\.\d+/.exec(version)?.[1];
  if (!major) throw new Error(`Couldn't read the Chromium version from "${version.trim()}"`);
  cachedUserAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  return cachedUserAgent;
}

/** Playwright wants credentials apart from the server address. */
function proxySettings(proxyUrl: string): { server: string; username?: string; password?: string } {
  const url = new URL(proxyUrl);
  const server = `${url.protocol}//${url.host}`;
  return url.username ? { server, username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) } : { server };
}
