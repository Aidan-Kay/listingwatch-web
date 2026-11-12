import type { Source } from "@listingwatch/shared/marketplaces";
import type { SearchError } from "@listingwatch/shared/schemas";

export interface ErrorAdvice {
  title: string;
  advice: string;
  /** Where the user can fix it, if anywhere. */
  fixAt?: { label: string; to: string };
}

/** Turn a poll failure into a cause and a next step, instead of a raw API message. */
export function adviceFor(error: SearchError, source: Source): ErrorAdvice {
  switch (error.kind) {
    case "config":
      return { title: "eBay isn't set up", advice: "Add your eBay API credentials so eBay searches can run.", fixAt: { label: "Open settings", to: "/settings#ebay" } };
    case "auth":
      return source === "ebay"
        ? { title: "eBay rejected the credentials", advice: "Check the Client ID and Client Secret, then test the connection.", fixAt: { label: "Open settings", to: "/settings#ebay" } }
        : { title: "Vinted session expired", advice: "It will start a new session automatically on the next poll." };
    case "quota":
    case "rate-limit":
      return {
        title: `${source === "ebay" ? "eBay" : "Vinted"} is limiting requests`,
        advice: "Polling backs off automatically. If it keeps happening, use longer intervals for this search.",
      };
    case "blocked":
      return {
        title: "Vinted's bot protection blocked the request",
        advice: "Polling will keep retrying with longer gaps. If it persists for hours, try routing through a proxy.",
        fixAt: { label: "Proxy settings", to: "/settings#proxy" },
      };
    case "challenge":
      return { title: "Couldn't get past Cloudflare's check", advice: "It will try again on the next poll." };
    case "offline":
      return { title: "The server is offline", advice: "It couldn't reach the internet. Polling resumes at the normal pace once it's back." };
    case "upstream":
      return { title: `${source === "ebay" ? "eBay" : "Vinted"} had a problem`, advice: "Usually temporary; it will retry automatically." };
    case "bad-response":
      return { title: "Unexpected answer from the marketplace", advice: error.message };
    case "unknown":
      return { title: "Polling failed", advice: error.message };
  }
}
