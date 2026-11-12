import type { ErrorKind } from "@listingwatch/shared/schemas";

/**
 * A failure talking to a marketplace, classified so the rest of the server can
 * react without parsing messages:
 * - `retryable` — worth another attempt within the same poll;
 * - `countsTowardsBackoff` — false for being offline, so a poll after the
 *   network comes back happens at the normal interval, not a backed-off one.
 */
export class MarketplaceError extends Error {
  readonly kind: ErrorKind;
  readonly status: number | undefined;

  constructor(kind: ErrorKind, message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "MarketplaceError";
    this.kind = kind;
    this.status = options.status;
  }

  get retryable(): boolean {
    return this.kind === "upstream" || this.kind === "rate-limit" || this.kind === "challenge";
  }

  get countsTowardsBackoff(): boolean {
    return this.kind !== "offline";
  }
}

const OFFLINE_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "ENETDOWN", "EHOSTUNREACH", "ECONNREFUSED"]);
const TRANSIENT_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"]);

/** Classify anything thrown by a network call. Abort errors pass through untouched. */
export function toMarketplaceError(error: unknown): MarketplaceError {
  if (error instanceof MarketplaceError) return error;
  const code = errorCode(error);
  if (code !== undefined && OFFLINE_CODES.has(code)) {
    return new MarketplaceError("offline", "No internet connection (couldn't reach the marketplace)", { cause: error });
  }
  if ((code !== undefined && TRANSIENT_CODES.has(code)) || isTimeout(error)) {
    return new MarketplaceError("upstream", "The marketplace took too long to answer", { cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new MarketplaceError("unknown", message, { cause: error });
}

/** Map an HTTP status to a kind, for responses that weren't successful. */
export function kindForStatus(status: number): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limit";
  if (status >= 500) return "upstream";
  return "bad-response";
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Node puts the system error code on `cause` for fetch failures. */
function errorCode(error: unknown): string | undefined {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}
