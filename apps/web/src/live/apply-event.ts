import type { ApiUsage, FeedResponse, LiveEvent, Listing, PollingState, Search } from "@listingwatch/shared/schemas";
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/hooks";

/** The feed holds at most this many listings, matching the server. */
const FEED_MAX = 500;

/** Update cached server state from one live event, so screens change without refetching. */
export function applyLiveEvent(client: QueryClient, event: LiveEvent): void {
  switch (event.type) {
    case "listings.added":
      return updateFeed(client, (listings) => {
        const incoming = new Set(event.listings.map((l) => l.key));
        return [...event.listings, ...listings.filter((l) => !incoming.has(l.key))].slice(0, FEED_MAX);
      });
    case "listings.merged":
      return updateFeed(client, (listings) => listings.map((l) => (l.key === event.key ? { ...l, searchIds: event.searchIds } : l)));
    case "listings.removed": {
      const removed = new Set(event.keys);
      return updateFeed(client, (listings) => listings.filter((l) => !removed.has(l.key)));
    }
    case "feed.cleared":
      return updateFeed(client, () => []);
    case "feed.seen":
      client.setQueryData<FeedResponse>(queryKeys.feed, (feed) => feed && { ...feed, seenAt: event.seenAt });
      return;
    case "search.status":
      client.setQueryData<Search[]>(queryKeys.searches, (list) => list?.map((s) => (s.id === event.searchId ? { ...s, status: event.status } : s)));
      return;
    case "polling.state":
      client.setQueryData<PollingState>(queryKeys.polling, { paused: event.paused });
      return;
    case "usage.changed":
      client.setQueryData<ApiUsage>(queryKeys.usage, (usage) => usage && { ...usage, day: event.day, calls: event.calls });
      return;
    case "searches.changed":
      void client.invalidateQueries({ queryKey: queryKeys.searches });
      void client.invalidateQueries({ queryKey: queryKeys.usage });
      return;
    case "lists.changed":
      void client.invalidateQueries({ queryKey: queryKeys.lists });
      return;
    case "favourites.changed":
      void client.invalidateQueries({ queryKey: queryKeys.favourites });
      return;
    case "settings.changed":
      void client.invalidateQueries({ queryKey: queryKeys.settings });
      return;
  }
}

function updateFeed(client: QueryClient, change: (listings: Listing[]) => Listing[]): void {
  client.setQueryData<FeedResponse>(queryKeys.feed, (feed) => feed && { ...feed, listings: change(feed.listings) });
}
