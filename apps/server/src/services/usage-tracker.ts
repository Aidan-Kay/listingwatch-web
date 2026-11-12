import type { ApiUsage } from "@listingwatch/shared/schemas";
import { projectedDailyCalls } from "../domain/intervals.ts";
import type { EventBus } from "../events/event-bus.ts";
import type { Repositories } from "../repositories/index.ts";

/** Counts eBay API calls per UTC day, against the user's daily limit. */
export class UsageTracker {
  private readonly repos: Repositories;
  private readonly events: EventBus;
  private readonly now: () => Date;

  constructor(repos: Repositories, events: EventBus, now: () => Date) {
    this.repos = repos;
    this.events = events;
    this.now = now;
  }

  recordCall(): void {
    const day = this.today();
    const calls = this.repos.apiUsage.increment(day);
    this.events.publish({ type: "usage.changed", day, calls });
  }

  usage(): ApiUsage {
    const settings = this.repos.settings.get();
    const day = this.today();
    const ebaySearches = this.repos.searches.list().filter((s) => s.source === "ebay" && s.enabled);
    return {
      day,
      calls: this.repos.apiUsage.callsOn(day),
      limit: settings.ebayDailyLimit,
      projectedDaily: projectedDailyCalls(ebaySearches, settings),
    };
  }

  private today(): string {
    return this.now().toISOString().slice(0, 10);
  }
}
