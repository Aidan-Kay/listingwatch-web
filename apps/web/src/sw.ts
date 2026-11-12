/// <reference lib="webworker" />
/**
 * Service worker: makes the app installable and loadable offline, and shows
 * push notifications for new listings.
 */
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute, type PrecacheEntry } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | PrecacheEntry)[] };

interface PushPayload {
  title: string;
  body: string;
  keys: string[];
  tag: string;
}

// Hashed assets come from the cache. Pages never do (an empty directoryIndex stops "/" mapping to the cached index.html): see below.
precacheAndRoute(self.__WB_MANIFEST, { directoryIndex: "", cleanURLs: false });
cleanupOutdatedCaches();

// Pages load from the network first so an authenticating proxy in front can
// redirect to its sign-in page when its session has expired; the cached shell
// is only the fallback when offline.
const pages = new NetworkFirst({ cacheName: "pages", networkTimeoutSeconds: 5 });
registerRoute(
  new NavigationRoute(
    async (options) => {
      try {
        return await pages.handle(options);
      } catch {
        return (await matchPrecache("/index.html")) ?? Response.error();
      }
    },
    { denylist: [/^\/api\//] },
  ),
);

self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("push", (event) => {
  const payload = event.data?.json() as PushPayload | undefined;
  if (!payload) return;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { keys: payload.keys },
    }),
  );
});

/** Open (or focus) the app on the feed, scrolled to the notified listings. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const keys = ((event.notification.data as { keys?: string[] } | null)?.keys ?? []).join(",");
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: "focus-listings", keys: keys.split(",").filter(Boolean) });
        return;
      }
      await self.clients.openWindow(`/?focus=${encodeURIComponent(keys)}`);
    })(),
  );
});
