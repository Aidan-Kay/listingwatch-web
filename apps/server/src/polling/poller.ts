import type { ListCompiler } from "@listingwatch/shared/keyword-match";
import { listingKey, type FoundListing, type Search, type SearchError } from "@listingwatch/shared/schemas";
import type { Database } from "../db/database.ts";
import { planPoll, type PollPlan } from "../domain/poll-pipeline.ts";
import type { EventBus } from "../events/event-bus.ts";
import type { Logger } from "../logger.ts";
import { isAbortError, toMarketplaceError } from "../marketplaces/errors.ts";
import type { AdapterRegistry } from "../marketplaces/types.ts";
import type { Repositories } from "../repositories/index.ts";
import type { RequestGate } from "./request-gate.ts";

export interface PollResult {
  search: Search;
  succeeded: boolean;
}

export interface NewListingsNotifier {
  /** Notify about freshly added listings; returns the keys that qualified. */
  notify(listings: PollPlan["added"]): string[];
}

export interface PollerDeps {
  db: Database;
  repos: Repositories;
  adapters: AdapterRegistry;
  lists: ListCompiler;
  gate: RequestGate;
  events: EventBus;
  notifier: NewListingsNotifier;
  log: Logger;
  now: () => Date;
}

/**
 * Polls one search: fetch from the marketplace, plan what the results mean,
 * apply the plan in a single transaction, then tell browsers and devices.
 * Never throws except when cancelled.
 */
export class Poller {
  private readonly deps: PollerDeps;

  constructor(deps: PollerDeps) {
    this.deps = deps;
  }

  async poll(searchId: string, signal: AbortSignal): Promise<PollResult | null> {
    const search = this.deps.repos.searches.get(searchId);
    if (!search?.enabled) return null;
    await this.deps.gate.acquire(search.source, signal);
    try {
      const found = await this.deps.adapters[search.source].search(search, signal);
      signal.throwIfAborted();
      this.applyResults(search, found);
      return { search: this.deps.repos.searches.get(searchId) ?? search, succeeded: true };
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw error;
      this.recordFailure(search, error);
      return { search: this.deps.repos.searches.get(searchId) ?? search, succeeded: false };
    }
  }

  private applyResults(search: Search, found: FoundListing[]): void {
    const { repos, db, now } = this.deps;
    const at = now();
    const plan = planPoll({
      searchId: search.id,
      excludeKeywords: search.excludeKeywords,
      baselineDone: search.status.baselineDone,
      found,
      lists: this.deps.lists.compileAll(search.includeListIds, repos.matchLists.list()),
      seenIds: repos.searchItems.seenIds(search.id),
      onFeed: repos.listings.searchIdsByKey(found.map(listingKey)),
      backfillHours: repos.settings.get().backfillHours,
      now: at,
    });
    const atIso = at.toISOString();
    const pruned = db.transaction(() => {
      repos.searchItems.markSeen(search.id, plan.seen, atIso);
      repos.listings.insert([...plan.added].reverse());
      for (const merge of plan.merged) repos.listings.setSearchIds(merge.key, merge.searchIds);
      repos.searchItems.markDelivered(search.id, plan.delivered, atIso);
      repos.searchItems.prune(search.id);
      repos.searches.recordSuccess(search.id, atIso, plan.added.length);
      return repos.listings.prune();
    })();
    this.announce(search, plan, pruned);
  }

  private announce(search: Search, plan: PollPlan, pruned: string[]): void {
    const { events, repos, log } = this.deps;
    log.info(
      { search: search.name, found: plan.seen.length, kept: plan.keptCount, added: plan.added.length, merged: plan.merged.length, baseline: plan.baseline },
      "Polled",
    );
    if (plan.added.length > 0) {
      const notifiable = plan.baseline ? [] : this.deps.notifier.notify(plan.added);
      events.publish({ type: "listings.added", listings: plan.added, notifiable });
    }
    for (const merge of plan.merged) events.publish({ type: "listings.merged", ...merge });
    if (pruned.length > 0) events.publish({ type: "listings.removed", keys: pruned });
    const updated = repos.searches.get(search.id);
    if (updated) events.publish({ type: "search.status", searchId: search.id, status: updated.status });
  }

  private recordFailure(search: Search, error: unknown): void {
    const failure = toMarketplaceError(error);
    const searchError: SearchError = { kind: failure.kind, message: failure.message, at: this.deps.now().toISOString() };
    this.deps.repos.searches.recordFailure(search.id, searchError, failure.countsTowardsBackoff);
    this.deps.log.warn({ search: search.name, kind: failure.kind, err: failure.cause ?? failure }, `Poll failed: ${failure.message}`);
    const updated = this.deps.repos.searches.get(search.id);
    if (updated) this.deps.events.publish({ type: "search.status", searchId: search.id, status: updated.status });
  }
}
