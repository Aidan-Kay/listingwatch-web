import { setTimeout as sleep } from "node:timers/promises";
import type { HttpClient } from "../../net/http-client.ts";
import { isAbortError, kindForStatus, MarketplaceError, toMarketplaceError } from "../errors.ts";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const TOKEN_SCOPE = "https://api.ebay.com/oauth/api_scope";
/** Refresh this long before eBay says the token expires. */
const TOKEN_MARGIN_MS = 60_000;
const RETRY_BASE_DELAY_MS = 1_000;

export interface EbayCredentials {
  clientId: string;
  clientSecret: string;
}

export interface EbayClientOptions {
  http: HttpClient;
  credentials: () => EbayCredentials | null;
  /** Called once per metered Browse/Taxonomy call (not token requests). */
  onApiCall: () => void;
  now?: () => number;
}

export interface EbayRequest {
  marketplaceId: string;
  signal: AbortSignal;
  attempts?: number;
  timeoutMs?: number;
}

/**
 * Authenticated eBay API access: an application token (client-credentials
 * grant) shared by concurrent callers, refreshed before expiry and after a
 * 401, with retries for transient failures.
 */
export class EbayClient {
  private readonly options: EbayClientOptions;
  private readonly now: () => number;
  private token: { value: string; expiresAt: number } | null = null;
  private pendingToken: Promise<string> | null = null;
  /** Bumped when credentials change, so a token fetched with old ones is discarded. */
  private generation = 0;

  constructor(options: EbayClientOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  invalidateToken(): void {
    this.token = null;
    this.pendingToken = null;
    this.generation++;
  }

  /** GET a JSON resource, retrying transient failures and an expired token. */
  async getJson<T>(url: string, request: EbayRequest): Promise<T> {
    const attempts = request.attempts ?? 3;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.getJsonOnce<T>(url, request);
      } catch (error) {
        if (isAbortError(error)) throw error;
        const failure = toMarketplaceError(error);
        const tokenRejected = failure.kind === "auth" && failure.status === 401;
        if (attempt >= attempts || !(failure.retryable || tokenRejected)) throw failure;
        if (tokenRejected) this.invalidateToken();
        else await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), undefined, { signal: request.signal });
      }
    }
  }

  /** Request a fresh token to prove the credentials work. */
  async verifyCredentials(signal: AbortSignal): Promise<void> {
    this.invalidateToken();
    await this.accessToken(signal);
  }

  private async getJsonOnce<T>(url: string, request: EbayRequest): Promise<T> {
    const token = await this.accessToken(request.signal);
    this.options.onApiCall();
    const response = await this.options.http.fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": request.marketplaceId, Accept: "application/json" },
      signal: request.signal,
      timeoutMs: request.timeoutMs ?? 15_000,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new MarketplaceError(kindForStatus(response.status), describeFailure(response.status, body), { status: response.status });
    }
    return (await response.json()) as T;
  }

  private accessToken(signal: AbortSignal): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt - TOKEN_MARGIN_MS) return Promise.resolve(this.token.value);
    this.pendingToken ??= this.fetchToken(signal).finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async fetchToken(signal: AbortSignal): Promise<string> {
    const credentials = this.options.credentials();
    if (!credentials) throw new MarketplaceError("config", "Add your eBay API credentials in Settings");
    const generation = this.generation;
    const response = await this.options.http.fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: TOKEN_SCOPE }).toString(),
      signal,
      timeoutMs: 15_000,
    });
    if (!response.ok) throw await tokenFailure(response.status, await response.text().catch(() => ""));
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token || !body.expires_in) throw new MarketplaceError("bad-response", "eBay's token response was missing the token");
    if (generation !== this.generation) throw new MarketplaceError("upstream", "eBay credentials changed while signing in; trying again");
    this.token = { value: body.access_token, expiresAt: this.now() + body.expires_in * 1000 };
    return body.access_token;
  }
}

async function tokenFailure(status: number, body: string): Promise<MarketplaceError> {
  if (status === 400 || status === 401) {
    return new MarketplaceError("auth", "eBay rejected the Client ID or Client Secret", { status: 400 });
  }
  return new MarketplaceError(kindForStatus(status), describeFailure(status, body), { status });
}

/** eBay error bodies are `{ errors: [{ message, longMessage }] }`; keep just the message. */
function describeFailure(status: number, body: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { errors?: { longMessage?: string; message?: string }[] };
    detail = parsed.errors?.[0]?.longMessage ?? parsed.errors?.[0]?.message ?? "";
  } catch {
    detail = body.slice(0, 200);
  }
  if (status === 429) return "eBay's API rate limit was reached";
  return `eBay answered ${status}${detail ? `: ${detail}` : ""}`;
}
