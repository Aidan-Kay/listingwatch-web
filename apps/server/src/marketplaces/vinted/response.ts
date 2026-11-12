import { MarketplaceError } from "../errors.ts";

/** What the in-page fetch returns. */
export interface PageFetchResult {
  status?: number;
  contentType?: string;
  body?: string;
  /** Set instead of the rest when fetch itself failed inside the page. */
  error?: string;
}

/** Markers in an HTML body that mean Cloudflare, not Vinted, answered. */
const CLOUDFLARE_MARKERS = ["challenges.cloudflare.com", "Just a moment", "cf-turnstile", "cdn-cgi/challenge-platform"];

/**
 * Turn the in-page fetch result into parsed JSON, or throw a classified error.
 * A Cloudflare challenge is retryable (the caller re-loads the homepage first);
 * a DataDome captcha isn't — nothing automated can solve it.
 */
export function parseCatalogueResponse(raw: PageFetchResult): unknown {
  if (raw.error !== undefined) {
    throw new MarketplaceError("upstream", `Request failed inside the browser: ${raw.error}`);
  }
  const status = raw.status ?? 0;
  const body = raw.body ?? "";
  if ((raw.contentType ?? "").includes("text/html")) {
    if (CLOUDFLARE_MARKERS.some((marker) => body.includes(marker))) {
      throw new MarketplaceError("challenge", "Cloudflare asked for a browser check", { status });
    }
    throw new MarketplaceError(status >= 500 ? "upstream" : "bad-response", `Vinted returned a web page instead of data (HTTP ${status})`, { status });
  }
  if (body.includes("captcha-delivery.com")) {
    throw new MarketplaceError("blocked", "Vinted's bot protection (DataDome) blocked the request and wants a captcha solved", { status });
  }
  if (status === 401) throw new MarketplaceError("auth", "Vinted's session expired", { status: 401 });
  if (status === 429) throw new MarketplaceError("rate-limit", "Vinted is limiting requests", { status });
  if (status >= 500) throw new MarketplaceError("upstream", `Vinted answered ${status}`, { status });
  if (status !== 200) throw new MarketplaceError("bad-response", `Vinted answered ${status}: ${body.slice(0, 200)}`, { status });
  try {
    return JSON.parse(body);
  } catch {
    throw new MarketplaceError("bad-response", "Vinted's answer wasn't valid JSON", { status });
  }
}

/** Resources a Cloudflare challenge needs, which must never be blocked. */
export function isCloudflareUrl(url: string): boolean {
  return url.includes("challenges.cloudflare.com") || url.includes("cdn-cgi/challenge-platform");
}
