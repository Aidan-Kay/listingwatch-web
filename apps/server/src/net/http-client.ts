import { socksDispatcher } from "fetch-socks";
import { Agent, fetch, ProxyAgent, type Dispatcher, type RequestInit, type Response } from "undici";

export type { Response };

export interface HttpRequestInit extends Omit<RequestInit, "dispatcher" | "signal"> {
  signal?: AbortSignal;
  /** Abort if no complete response within this time. */
  timeoutMs?: number;
}

/** Outbound HTTP, routed through the configured proxy when there is one. */
export interface HttpClient {
  fetch(url: string, init?: HttpRequestInit): Promise<Response>;
  /** Route later requests through `proxyUrl` (http://, https:// or socks5://), or directly when null. */
  useProxy(proxyUrl: string | null): void;
}

export function createHttpClient(): HttpClient {
  let dispatcher: Dispatcher = new Agent();
  return {
    fetch(url, init = {}) {
      const { timeoutMs, signal, ...rest } = init;
      const signals = [signal, timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs)].filter((s) => s !== undefined);
      return fetch(url, { ...rest, dispatcher, signal: signals.length > 0 ? AbortSignal.any(signals) : null });
    },
    useProxy(proxyUrl) {
      const previous = dispatcher;
      dispatcher = proxyUrl === null ? new Agent() : dispatcherFor(proxyUrl);
      void previous.close().catch(() => {});
    },
  };
}

/** A one-off dispatcher for testing a proxy without switching to it. */
export async function fetchThroughProxy(proxyUrl: string, url: string, timeoutMs: number): Promise<Response> {
  const dispatcher = dispatcherFor(proxyUrl);
  try {
    return await fetch(url, { dispatcher, signal: AbortSignal.timeout(timeoutMs) });
  } finally {
    void dispatcher.close().catch(() => {});
  }
}

function dispatcherFor(proxyUrl: string): Dispatcher {
  const url = new URL(proxyUrl);
  if (url.protocol.startsWith("socks")) {
    return socksDispatcher({
      type: 5,
      host: url.hostname,
      port: Number(url.port || 1080),
      ...(url.username ? { userId: decodeURIComponent(url.username), password: decodeURIComponent(url.password) } : {}),
    });
  }
  return new ProxyAgent(proxyUrl);
}
