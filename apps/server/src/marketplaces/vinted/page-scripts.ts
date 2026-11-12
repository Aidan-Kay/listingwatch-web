// These functions run inside the Vinted page via page.evaluate(), so they can
// only use browser globals, never anything from this module's scope.

// The few browser globals used, declared here rather than pulling the whole DOM
// library into the server's types.
declare const document: { documentElement: { lang: string }; title: string };
declare const location: { href: string };
declare const window: object;

/**
 * Fetch `url` from inside the page, so the request carries the browser's TLS
 * fingerprint, headers and cookies.
 *
 * The catalogue API is on `api.<domain>` and the page on the site domain:
 * cross-origin, same-site. Cookies therefore need `credentials: "include"`, and
 * only headers Vinted's own front end sends pass the CORS preflight. `Locale`
 * comes from the page's `lang`, as the front end sends it; without it Vinted
 * answers in French on every site. Errors are returned, not thrown, so a
 * network failure inside the page is distinguishable from a browser failure.
 */
export async function fetchInPage(args: { url: string; timeoutMs: number }): Promise<{ status?: number; contentType?: string; body?: string; error?: string }> {
  const locale = document.documentElement.lang;
  const headers: Record<string, string> = { Accept: "application/json, text/plain, */*", Platform: "web" };
  if (locale) headers["Locale"] = locale;
  try {
    const response = await fetch(args.url, { signal: AbortSignal.timeout(args.timeoutMs), headers, credentials: "include" });
    return { status: response.status, contentType: response.headers.get("content-type") ?? "", body: await response.text() };
  } catch (error) {
    return { error: String(error) };
  }
}

export interface PageState {
  url: string;
  title: string;
  /** A Cloudflare interstitial is showing. */
  challenge: boolean;
}

/**
 * Whether a Cloudflare interstitial is showing. Cloudflare injects a
 * `cdn-cgi/challenge-platform` script into every page it fronts, so marker
 * matching on the page reports false challenges; the interstitial is
 * identified by its title and its `_cf_chl_opt` config object instead.
 */
export function inspectPage(): PageState {
  return {
    url: location.href,
    title: document.title,
    challenge: document.title.includes("Just a moment") || "_cf_chl_opt" in window,
  };
}
