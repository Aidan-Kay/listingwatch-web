import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useFeed, useSettings } from "@/api/hooks";

/**
 * App-wide side effects: apply the accent colour, show the unseen count as the
 * app badge and title, and open the feed at listings a notification pointed to.
 */
export function useAppEffects(): { unseen: number } {
  const settings = useSettings();
  const feed = useFeed();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const accent = settings.data?.settings.accentColor;
  useEffect(() => {
    if (accent) document.documentElement.style.setProperty("--brand", accent);
  }, [accent]);

  const unseen = useMemo(() => {
    const seenAt = feed.data?.seenAt ? Date.parse(feed.data.seenAt) : 0;
    return feed.data?.listings.filter((l) => Date.parse(l.foundAt) > seenAt).length ?? 0;
  }, [feed.data]);

  useEffect(() => {
    document.title = unseen > 0 ? `(${unseen}) ListingWatch` : "ListingWatch";
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unseen > 0) void nav.setAppBadge?.(unseen).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [unseen]);

  // A notification opened the app (?focus=…) or was clicked while it was open (a message from the service worker).
  const focus = params.get("focus");
  useEffect(() => {
    if (focus) void navigate("/", { replace: true, state: { focus: focus.split(",") } });
  }, [focus, navigate]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent<{ type?: string; keys?: string[] }>) => {
      if (event.data.type === "focus-listings") void navigate("/", { state: { focus: event.data.keys ?? [] } });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  return { unseen };
}
