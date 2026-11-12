import type { Favourite, FeedResponse } from "@listingwatch/shared/schemas";
import type { EventBus } from "../events/event-bus.ts";
import type { Repositories } from "../repositories/index.ts";
import { notFound } from "./errors.ts";

const SEEN_AT_KEY = "feed.seenAt";

/** The feed and favourites: what the user browses. */
export class FeedService {
  private readonly repos: Repositories;
  private readonly events: EventBus;
  private readonly now: () => Date;

  constructor(repos: Repositories, events: EventBus, now: () => Date) {
    this.repos = repos;
    this.events = events;
    this.now = now;
  }

  feed(): FeedResponse {
    return { listings: this.repos.listings.list(), seenAt: this.repos.appState.get(SEEN_AT_KEY) };
  }

  /** The feed was viewed on some device: everything up to now counts as seen everywhere. */
  markSeen(): string {
    const seenAt = this.now().toISOString();
    this.repos.appState.set(SEEN_AT_KEY, seenAt);
    this.events.publish({ type: "feed.seen", seenAt });
    return seenAt;
  }

  /** Remove one listing. It stays delivered, so it won't come back. */
  dismiss(key: string): void {
    if (!this.repos.listings.delete(key)) throw notFound("Listing");
    this.events.publish({ type: "listings.removed", keys: [key] });
  }

  clear(): void {
    this.repos.listings.clear();
    this.events.publish({ type: "feed.cleared" });
  }

  favourites(): Favourite[] {
    return this.repos.favourites.list();
  }

  /** Save a snapshot of a feed listing. Saving again refreshes the snapshot but keeps its date. */
  addFavourite(key: string): void {
    const listing = this.repos.listings.get(key);
    if (!listing) throw notFound("Listing");
    this.repos.favourites.put(listing, this.now().toISOString());
    this.events.publish({ type: "favourites.changed" });
  }

  removeFavourite(key: string): void {
    if (!this.repos.favourites.delete(key)) throw notFound("Favourite");
    this.events.publish({ type: "favourites.changed" });
  }

  clearFavourites(): void {
    this.repos.favourites.clear();
    this.events.publish({ type: "favourites.changed" });
  }
}
